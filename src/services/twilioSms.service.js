import dotenv from 'dotenv';
dotenv.config({ override: true });
import twilio from 'twilio';

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_MESSAGING_SERVICE_SID,
  TWILIO_STATUS_CALLBACK_URL
} = process.env;

const client = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

function mapTwilioError(err) {
  const code = err?.code;
  if (code === 21608) {
    return { code: 'SMS_TRIAL_UNVERIFIED', message: 'Conta de teste: este numero precisa estar verificado para receber SMS.' };
  }
  if (code === 21211) {
    return { code: 'SMS_INVALID_NUMBER', message: 'Telefone invalido.' };
  }
  if (code === 21604) {
    return { code: 'SMS_PROVIDER_ERROR', message: 'Nao foi possivel enviar o SMS agora. Tente novamente.' };
  }
  if (code === 20003) {
    return { code: 'SMS_PROVIDER_ERROR', message: 'Nao foi possivel enviar o SMS agora. Tente novamente.' };
  }
  return { code: 'SMS_PROVIDER_ERROR', message: 'Nao foi possivel enviar o SMS agora. Tente novamente.' };
}

function isE164(value) {
  return /^\+\d{10,15}$/.test(String(value || ''));
}

export async function enviarSMS(toE164, mensagem) {
  if (!client || !TWILIO_MESSAGING_SERVICE_SID) {
    console.error('[SMS] Twilio nao configurado corretamente.');
    return { ok: false, code: 'SMS_NOT_CONFIGURED', message: 'SMS indisponivel no momento.', messageSid: null };
  }
  if (!isE164(toE164)) {
    return { ok: false, code: 'SMS_INVALID_NUMBER', message: 'Telefone invalido.', messageSid: null };
  }

  try {
    const response = await client.messages.create({
      to: toE164,
      messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
      body: mensagem,
      statusCallback: TWILIO_STATUS_CALLBACK_URL || undefined
    });

    const isDev = (process.env.NODE_ENV || '').toLowerCase() !== 'production';
    if (isDev && response?.sid) {
      console.info(`[SMS] SID: ${response.sid}`);
    } else {
      console.info('[SMS] Mensagem enviada.');
    }
    return { ok: true, code: null, message: 'OK', messageSid: response?.sid || null };
  } catch (err) {
    const mapped = mapTwilioError(err);
    console.error(`[SMS] Falha ao enviar. CODE: ${mapped.code}`);
    return { ok: false, ...mapped, messageSid: null };
  }
}
