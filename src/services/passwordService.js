import {
    createOtp,
    createResetToken,
    findAlunoByMatriculaAndEmail,
    getLastOtpCreatedAt,
    getLatestOtpByMatricula,
    getValidResetToken,
    incrementOtpAttempts,
    invalidateOtps,
    invalidateResetTokens,
    markOtpUsed,
    markResetTokenUsed,
    updateSenha
} from '../repositories/passwordRepository.js';
import { sendOtpEmail } from './mailerService.js';
import { generateOtp, generateToken, hashSha256, timingSafeEqualHex } from '../utils/cryptoUtil.js';
import { isValidMatricula, isValidOtp, isValidPassword, normalizeMatricula } from '../utils/validators.js';
import { validateEmail } from './emailValidator.js';

const OTP_TTL_MIN = 15;
const RESET_TTL_MIN = 10;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}

function genericOtpResponse() {
    return {
        ok: true,
        message: 'Se os dados estiverem corretos, enviaremos o código no seu e-mail.'
    };
}

export async function requestOtp({ matricula, email }) {
    const cleanMatricula = normalizeMatricula(matricula);
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!isValidMatricula(cleanMatricula)) {
        return { ok: false, status: 400, message: 'Dados inválidos.' };
    }

    const emailValidation = await validateEmail(cleanEmail);
    if (!emailValidation.valid) {
        const message = emailValidation.suggestion ?
            `E-mail inválido. Você quis dizer ${emailValidation.suggestion}?` :
            'E-mail inválido.';
        return { ok: false, status: 400, message };
    }

    const aluno = await findAlunoByMatriculaAndEmail(cleanMatricula, cleanEmail);
    if (!aluno) {
        return { ok: false, status: 404, message: 'Matrícula e e-mail não conferem.' };
    }

    const lastCreatedAt = await getLastOtpCreatedAt(cleanMatricula);
    if (lastCreatedAt) {
        const diffSec = Math.floor((Date.now() - new Date(lastCreatedAt).getTime()) / 1000);
        if (diffSec < OTP_RESEND_SECONDS) {
            return {
                ok: false,
                status: 429,
                message: `Aguarde ${OTP_RESEND_SECONDS - diffSec}s para solicitar outro código.`
            };
        }
    }

    await invalidateOtps(cleanMatricula);

    const otp = generateOtp();
    const codigoHash = hashSha256(otp);
    const expiraEm = addMinutes(new Date(), OTP_TTL_MIN);

    await createOtp({ matricula: cleanMatricula, codigoHash, expiraEm });

    try {
        await sendOtpEmail({ to: aluno.email_pessoal, nome: aluno.nome, matricula: cleanMatricula, otp });
    } catch (err) {
        console.error('Falha ao enviar e-mail de OTP:', err?.message || err);
        return { ok: false, status: 502, message: 'Não foi possível enviar o código. Tente novamente em instantes.' };
    }

    return genericOtpResponse();
}

export async function verifyOtp({ matricula, otp }) {
    const cleanMatricula = normalizeMatricula(matricula);
    const cleanOtp = String(otp || '').trim();

    if (!isValidMatricula(cleanMatricula) || !isValidOtp(cleanOtp)) {
        return { ok: false, status: 400, message: 'Código inválido ou expirado.' };
    }

    const registro = await getLatestOtpByMatricula(cleanMatricula);
    if (!registro) {
        return { ok: false, status: 400, message: 'Código inválido ou expirado.' };
    }

    const now = new Date();
    if (registro.usado || new Date(registro.expira_em) < now) {
        await markOtpUsed(registro.id);
        return { ok: false, status: 400, message: 'Código inválido ou expirado.' };
    }

    if (registro.tentativas >= OTP_MAX_ATTEMPTS) {
        await markOtpUsed(registro.id);
        return { ok: false, status: 429, message: 'Limite de tentativas excedido.' };
    }

    const otpHash = hashSha256(cleanOtp);
    const isValid = timingSafeEqualHex(otpHash, registro.codigo_hash);

    if (!isValid) {
        await incrementOtpAttempts(registro.id);
        return { ok: false, status: 400, message: 'Código inválido ou expirado.' };
    }

    await markOtpUsed(registro.id);
    await invalidateResetTokens(cleanMatricula);

    const resetToken = generateToken();
    const tokenHash = hashSha256(resetToken);
    const expiraEm = addMinutes(now, RESET_TTL_MIN);

    await createResetToken({ matricula: cleanMatricula, tokenHash, expiraEm });

    return { ok: true, resetToken, expiresInMin: RESET_TTL_MIN };
}

export async function resetPassword({ matricula, resetToken, novaSenha }) {
    const cleanMatricula = normalizeMatricula(matricula);
    const token = String(resetToken || '').trim();
    const senha = String(novaSenha || '');

    if (!isValidMatricula(cleanMatricula) || !token || !isValidPassword(senha)) {
        return { ok: false, status: 400, message: 'Dados inválidos.' };
    }

    const tokenHash = hashSha256(token);
    const registro = await getValidResetToken(cleanMatricula, tokenHash);
    if (!registro) {
        return { ok: false, status: 400, message: 'Token inválido ou expirado.' };
    }

    if (new Date(registro.expira_em) < new Date()) {
        await markResetTokenUsed(registro.id);
        return { ok: false, status: 400, message: 'Token inválido ou expirado.' };
    }

    await updateSenha(cleanMatricula, senha);
    await markResetTokenUsed(registro.id);
    await invalidateResetTokens(cleanMatricula);

    return { ok: true };
}
