import twilio from 'twilio';
import { logWarn } from '../../utils/logger.util.js';

function mapTwilioError(err) {
  const code = err?.code;
  const message = err?.message || 'Falha ao enviar SMS.';
  if (code === 21608) {
    return { code: 'TWILIO_TRIAL_UNVERIFIED', message: 'Número não permitido para conta de teste.' };
  }
  if (code === 21211) {
    return { code: 'TWILIO_INVALID_NUMBER', message: 'Número de telefone inválido.' };
  }
  if (code === 21610) {
    return { code: 'TWILIO_UNSUBSCRIBED', message: 'Destino bloqueou mensagens.' };
  }
  if (code === 20003) {
    return { code: 'TWILIO_AUTH_FAILED', message: 'Credenciais inválidas.' };
  }
  if (code === 21604) {
    return { code: 'TWILIO_MESSAGING_SERVICE_INVALID', message: 'Messaging Service inválido.' };
  }
  return { code: 'TWILIO_ERROR', message };
}

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return twilio(accountSid, authToken);
}

export async function sendSMS({ toE164, body, statusCallbackUrl }) {
  const client = getClient();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!client || !messagingServiceSid) {
    return { ok: false, code: 'TWILIO_NOT_CONFIGURED', message: 'Twilio nao configurado.' };
  }

  try {
    const payload = {
      to: toE164,
      messagingServiceSid,
      body
    };
    if (statusCallbackUrl) payload.statusCallback = statusCallbackUrl;

    const message = await client.messages.create(payload);
    return { ok: true, messageSid: message?.sid || null };
  } catch (err) {
    const mapped = mapTwilioError(err);
    logWarn('SMS_TWILIO_FAIL', { code: mapped.code });
    return { ok: false, ...mapped, messageSid: err?.sid || null };
  }
}
