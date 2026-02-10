import { enviarSMS } from '../services/twilioSms.service.js';
import { normalizePhoneBR, validateBR, toE164BR, maskPhoneBR } from '../utils/phone.util.js';

export async function smsTestHandler(req, res) {
  const { telefone } = req.body || {};
  if (!telefone) {
    return res.status(400).json({ ok: false, message: 'Informe o telefone.' });
  }

  const digits = normalizePhoneBR(telefone);
  if (!validateBR(digits)) {
    return res.status(400).json({ ok: false, code: 'SMS_INVALID_NUMBER', message: 'Telefone invalido.' });
  }
  const toE164 = toE164BR(digits);
  const result = await enviarSMS(toE164, 'Teste JICS: SMS OK');

  if (!result.ok) {
    const status = result.code === 'SMS_NOT_CONFIGURED' ? 503 : (result.code === 'SMS_PROVIDER_ERROR' ? 502 : 400);
    return res.status(status).json({ ok: false, code: result.code, message: result.message });
  }

  return res.json({
    ok: true,
    messageSid: result.messageSid || null,
    toMasked: maskPhoneBR(digits)
  });
}
