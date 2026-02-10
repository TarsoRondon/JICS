import {
  getAlunoByMatricula,
  getLatestOtpStatus,
  getLatestOtpActive,
  invalidateOtpsByFinalidade,
  createOtp,
  incrementOtpAttempts,
  markOtpUsed,
  updateOtpBlock,
  updateAlunoSenha,
  updateAlunoTelefone,
} from '../repositories/recoveryRepository.js';
import {
  OTP_CONFIG,
  normalizeEmail,
  extractPhones,
  pickMatchingPhone,
  maskEmail,
  maskPhone,
  generateOtp,
  hashOtp,
  isStrongPassword,
  signOtpToken,
  verifyOtpToken,
} from '../utils/otp.util.js';
import { normalizePhoneBR, toE164BR, validateBR } from '../utils/phone.util.js';
import { normalizeMatricula } from '../utils/validators.js';
import { sendOtpEmail } from './email.service.js';
import { enviarSMS } from './twilioSms.service.js';

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function isAllowedFinalidade(finalidade) {
  return ['FIRST_ACCESS', 'RESET_PASSWORD', 'CHANGE_PHONE_OLD', 'CHANGE_PHONE_NEW'].includes(finalidade);
}

function resolveDestino(aluno, canal) {
  if (canal === 'sms') return aluno.telefone || '';
  if (canal === 'email_pessoal') return aluno.email_pessoal || '';
  if (canal === 'email_academico') return aluno.email_academico || '';
  return '';
}

function normalizeContato(canal, contato) {
  if (canal === 'sms') return normalizePhoneBR(contato);
  return normalizeEmail(contato);
}

function maskDestino(canal, destino) {
  if (canal === 'sms') return maskPhone(destino);
  return maskEmail(destino);
}

export async function validateRecovery({ matricula, canal, contato, finalidade }) {
  const cleanMatricula = normalizeMatricula(matricula);
  if (!cleanMatricula || !canal || !isAllowedFinalidade(finalidade)) {
    return { ok: false, code: 'INVALID_MATCH', message: 'Dados nao conferem.' };
  }

  const aluno = await getAlunoByMatricula(cleanMatricula);
  if (!aluno) {
    return { ok: false, code: 'INVALID_MATCH', message: 'Dados nao conferem.' };
  }

  const destino = resolveDestino(aluno, canal);
  if (!destino) {
    return { ok: false, code: 'INVALID_MATCH', message: 'Dados nao conferem.' };
  }

  if (canal === 'sms') {
    const phones = extractPhones(destino);
    const matched = pickMatchingPhone(phones, contato);
    if (!matched) {
      return { ok: false, code: 'INVALID_MATCH', message: 'Dados nao conferem.' };
    }
    return { ok: true, masked: maskPhone(matched) };
  }

  const contatoNorm = normalizeContato(canal, contato);
  const destinoNorm = normalizeContato(canal, destino);

  if (!contatoNorm || contatoNorm !== destinoNorm) {
    return { ok: false, code: 'INVALID_MATCH', message: 'Dados nao conferem.' };
  }

  return { ok: true, masked: maskDestino(canal, destino) };
}

export async function requestOtp({ matricula, canal, finalidade, contato }) {
  const cleanMatricula = normalizeMatricula(matricula);
  if (!cleanMatricula || !canal || !isAllowedFinalidade(finalidade)) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'Dados invalidos.' };
  }

  const aluno = await getAlunoByMatricula(cleanMatricula);
  if (!aluno) {
    return { ok: false, code: 'INVALID_MATCH', message: 'Dados nao conferem.' };
  }

  const destino = resolveDestino(aluno, canal);
  if (!destino) {
    return { ok: false, code: 'INVALID_MATCH', message: 'Dados nao conferem.' };
  }
  let destinoFinal = destino;
  const requireContato = ['FIRST_ACCESS', 'RESET_PASSWORD'].includes(finalidade);
  if (requireContato && !contato) {
    return { ok: false, code: 'INVALID_MATCH', message: 'Dados nao conferem.' };
  }
  if (canal === 'sms') {
    const phones = extractPhones(destino);
    let matched = pickMatchingPhone(phones, contato);
    if (!matched && !contato && finalidade === 'CHANGE_PHONE_OLD' && phones.length) {
      matched = phones[0];
    }
    if (!matched) {
      return { ok: false, code: 'INVALID_MATCH', message: 'Dados nao conferem.' };
    }
    destinoFinal = matched;
  }
  if (requireContato && canal !== 'sms') {
    const contatoNorm = normalizeContato(canal, contato);
    const destinoNorm = normalizeContato(canal, destinoFinal);
    if (!contatoNorm || contatoNorm !== destinoNorm) {
      return { ok: false, code: 'INVALID_MATCH', message: 'Dados nao conferem.' };
    }
  }
  if (canal === 'sms') {
    destinoFinal = normalizePhoneBR(destinoFinal);
  }
  if (canal === 'sms' && !destinoFinal) {
    return { ok: false, code: 'INVALID_MATCH', message: 'Dados nao conferem.' };
  }

  const last = await getLatestOtpStatus({ matricula: cleanMatricula, finalidade, canal });
  const now = new Date();
  if (last?.bloqueado_ate && new Date(last.bloqueado_ate) > now) {
    return { ok: false, code: 'BLOCKED', message: 'Aguarde alguns minutos para tentar novamente.' };
  }

  if (last?.ultimo_envio_em) {
    const diffSec = Math.floor((now.getTime() - new Date(last.ultimo_envio_em).getTime()) / 1000);
    if (diffSec < OTP_CONFIG.resendSeconds) {
      return { ok: false, code: 'WAIT', message: 'Aguarde para solicitar um novo codigo.', secondsLeft: OTP_CONFIG.resendSeconds - diffSec };
    }
  }

  await invalidateOtpsByFinalidade(cleanMatricula, finalidade);

  const otp = generateOtp();
  const codigoHash = hashOtp({ otp, matricula: cleanMatricula, finalidade });
  const expiraEm = addMinutes(now, OTP_CONFIG.ttlMinutes);

  await createOtp({
    matricula: cleanMatricula,
    codigoHash,
    expiraEm,
    finalidade,
    canal,
    destino: destinoFinal,
    ultimoEnvioEm: now,
  });

  if (canal === 'sms') {
    const digits = normalizePhoneBR(destinoFinal);
    if (!validateBR(digits)) {
      return { ok: false, code: 'SMS_INVALID_NUMBER', message: 'Telefone invalido.' };
    }
    const toE164 = toE164BR(digits);
    const smsResult = await enviarSMS(toE164, `JICS: seu codigo e ${otp}. Expira em 5 min. Nao compartilhe.`);
    if (smsResult?.ok) {
      return { ok: true, masked: maskPhone(digits), channel: 'sms', messageSid: smsResult.messageSid || null };
    }
    return { ok: false, code: smsResult.code, message: smsResult.message };
  }

  try {
    await sendOtpEmail({ to: destinoFinal, nome: aluno.nome, matricula: cleanMatricula, otp, finalidade });
  } catch {
    return { ok: false, code: 'EMAIL_FAILED', message: 'Nao foi possivel enviar o codigo.' };
  }

  return { ok: true, masked: maskDestino(canal, destinoFinal), channel: 'email' };
}

export async function verifyOtp({ matricula, finalidade, otp, destino = null }) {
  const cleanMatricula = normalizeMatricula(matricula);
  if (!cleanMatricula || !isAllowedFinalidade(finalidade) || !otp) {
    return { ok: false, code: 'INVALID_OTP', message: 'Codigo invalido.' };
  }

  const record = await getLatestOtpActive({ matricula: cleanMatricula, finalidade, destino });
  if (!record) {
    return { ok: false, code: 'NOT_FOUND', message: 'Codigo invalido.' };
  }

  const now = new Date();
  if (record.bloqueado_ate && new Date(record.bloqueado_ate) > now) {
    return { ok: false, code: 'BLOCKED', message: 'Muitas tentativas. Tente novamente mais tarde.' };
  }

  if (new Date(record.expira_em) < now) {
    await markOtpUsed(record.id);
    return { ok: false, code: 'EXPIRED', message: 'Codigo expirado.' };
  }

  if (record.tentativas >= OTP_CONFIG.maxAttempts) {
    const bloqueadoAte = addMinutes(now, OTP_CONFIG.blockMinutes);
    await updateOtpBlock(record.id, bloqueadoAte);
    return { ok: false, code: 'BLOCKED', message: 'Limite de tentativas excedido.' };
  }

  const hash = hashOtp({ otp, matricula: cleanMatricula, finalidade });
  if (hash !== record.codigo_hash) {
    await incrementOtpAttempts(record.id);
    const attemptsLeft = Math.max(0, OTP_CONFIG.maxAttempts - (record.tentativas + 1));
    if (attemptsLeft === 0) {
      const bloqueadoAte = addMinutes(now, OTP_CONFIG.blockMinutes);
      await updateOtpBlock(record.id, bloqueadoAte);
    }
    return { ok: false, code: 'INVALID_OTP', message: 'Codigo invalido.', attemptsLeft };
  }

  await markOtpUsed(record.id);
  const token = signOtpToken({ matricula: cleanMatricula, finalidade, purpose: 'OTP_VERIFIED' });
  return { ok: true, token };
}

export async function setPassword({ token, newPassword }) {
  if (!token) {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Token invalido.' };
  }
  let payload;
  try {
    payload = verifyOtpToken(token);
  } catch {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Token invalido.' };
  }

  if (!payload || payload.purpose !== 'OTP_VERIFIED') {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Token invalido.' };
  }

  if (!isStrongPassword(newPassword)) {
    return { ok: false, code: 'WEAK_PASSWORD', message: 'Senha fraca.' };
  }

  await updateAlunoSenha(payload.matricula, newPassword);
  return { ok: true };
}

export async function requestPhoneChangeOld({ matricula }) {
  return requestOtp({ matricula, canal: 'sms', finalidade: 'CHANGE_PHONE_OLD' });
}

export async function verifyPhoneChangeOld({ matricula, otp }) {
  const result = await verifyOtp({ matricula, finalidade: 'CHANGE_PHONE_OLD', otp });
  if (!result.ok) return result;
  const token = signOtpToken({ matricula, purpose: 'PHONE_OLD_OK' });
  return { ok: true, phoneChangeToken: token };
}

export async function requestPhoneChangeNew({ phoneChangeToken, novoTelefone }) {
  let payload;
  try {
    payload = verifyOtpToken(phoneChangeToken);
  } catch {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Token invalido.' };
  }
  if (!payload || payload.purpose !== 'PHONE_OLD_OK') {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Token invalido.' };
  }
  const destino = normalizePhoneBR(novoTelefone);
  if (!destino || destino.length < 8) {
    return { ok: false, code: 'INVALID_PHONE', message: 'Telefone invalido.' };
  }

  const last = await getLatestOtpStatus({ matricula: payload.matricula, finalidade: 'CHANGE_PHONE_NEW', canal: 'sms' });
  const now = new Date();
  if (last?.bloqueado_ate && new Date(last.bloqueado_ate) > now) {
    return { ok: false, code: 'BLOCKED', message: 'Aguarde alguns minutos para tentar novamente.' };
  }
  if (last?.ultimo_envio_em) {
    const diffSec = Math.floor((now.getTime() - new Date(last.ultimo_envio_em).getTime()) / 1000);
    if (diffSec < OTP_CONFIG.resendSeconds) {
      return { ok: false, code: 'WAIT', message: 'Aguarde para solicitar um novo codigo.', secondsLeft: OTP_CONFIG.resendSeconds - diffSec };
    }
  }

  await invalidateOtpsByFinalidade(payload.matricula, 'CHANGE_PHONE_NEW');

  const otp = generateOtp();
  const codigoHash = hashOtp({ otp, matricula: payload.matricula, finalidade: 'CHANGE_PHONE_NEW' });
  const expiraEm = addMinutes(now, OTP_CONFIG.ttlMinutes);
  await createOtp({
    matricula: payload.matricula,
    codigoHash,
    expiraEm,
    finalidade: 'CHANGE_PHONE_NEW',
    canal: 'sms',
    destino,
    ultimoEnvioEm: now,
  });

  const digits = normalizePhoneBR(destino);
  if (!validateBR(digits)) {
    return { ok: false, code: 'SMS_INVALID_NUMBER', message: 'Telefone invalido.' };
  }
  const toE164 = toE164BR(digits);
  const smsResult = await enviarSMS(toE164, `JICS: seu codigo e ${otp}. Expira em 5 min. Nao compartilhe.`);
  if (!smsResult?.ok) {
    return { ok: false, code: smsResult.code, message: smsResult.message };
  }

  return { ok: true, masked: maskPhone(digits) };
}

export async function verifyPhoneChangeNew({ phoneChangeToken, novoTelefone, otp }) {
  let payload;
  try {
    payload = verifyOtpToken(phoneChangeToken);
  } catch {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Token invalido.' };
  }
  if (!payload || payload.purpose !== 'PHONE_OLD_OK') {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Token invalido.' };
  }
  const destino = normalizePhoneBR(novoTelefone);
  if (!destino || destino.length < 8) {
    return { ok: false, code: 'INVALID_PHONE', message: 'Telefone invalido.' };
  }

  const result = await verifyOtp({ matricula: payload.matricula, finalidade: 'CHANGE_PHONE_NEW', otp, destino });
  if (!result.ok) return result;

  await updateAlunoTelefone(payload.matricula, destino);
  return { ok: true };
}
