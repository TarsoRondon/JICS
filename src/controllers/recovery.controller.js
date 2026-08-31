import {
  validateRecovery,
  requestOtp,
  verifyOtp,
  setPassword,
  requestPhoneChangeOld,
  verifyPhoneChangeOld,
  requestPhoneChangeNew,
  verifyPhoneChangeNew,
} from '../services/recovery.service.js';

export async function validateRecoveryHandler(req, res) {
  try {
    const { matricula, canal, contato, finalidade } = req.body || {};
    const result = await validateRecovery({ matricula, canal, contato, finalidade });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[ERRO_VALIDATE_RECOVERY]:', err);
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Erro interno no servidor: ' + (err?.message || '') });
  }
}

export async function requestOtpHandler(req, res) {
  try {
    const { matricula, canal, finalidade, contato } = req.body || {};
    const result = await requestOtp({ matricula, canal, finalidade, contato });
    if (!result.ok) {
      if (result.code === 'WAIT' || result.code === 'BLOCKED') {
        return res.status(429).json(result);
      }
      if (result.code === 'SMS_PROVIDER_ERROR' || result.code === 'EMAIL_FAILED') {
        return res.status(502).json(result);
      }
      if (result.code === 'SMS_NOT_CONFIGURED' || result.code === 'EMAIL_NOT_CONFIGURED') {
        return res.status(503).json(result);
      }
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[ERRO_REQUEST_OTP]:', err);
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Erro interno ao solicitar código: ' + (err?.message || '') });
  }
}

export async function verifyOtpHandler(req, res) {
  try {
    const { matricula, finalidade, otp } = req.body || {};
    const result = await verifyOtp({ matricula, finalidade, otp });
    if (!result.ok) {
      return res.status(result.code === 'BLOCKED' ? 429 : 400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[ERRO_VERIFY_OTP]:', err);
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Erro interno ao validar código: ' + (err?.message || '') });
  }
}

export async function setPasswordHandler(req, res) {
  try {
    const { token, newPassword } = req.body || {};
    const result = await setPassword({ token, newPassword });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[ERRO_SET_PASSWORD]:', err);
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Erro interno ao redefinir senha: ' + (err?.message || '') });
  }
}

export async function requestPhoneOldHandler(req, res) {
  try {
    const matricula = req.user?.matricula;
    const result = await requestPhoneChangeOld({ matricula });
    if (!result.ok) {
      return res.status(result.code === 'WAIT' || result.code === 'BLOCKED' ? 429 : 400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[ERRO_REQUEST_PHONE_OLD]:', err);
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Erro interno.' });
  }
}

export async function verifyPhoneOldHandler(req, res) {
  try {
    const matricula = req.user?.matricula;
    const { otp } = req.body || {};
    const result = await verifyPhoneChangeOld({ matricula, otp });
    if (!result.ok) {
      return res.status(result.code === 'BLOCKED' ? 429 : 400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[ERRO_VERIFY_PHONE_OLD]:', err);
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Erro interno.' });
  }
}

export async function requestPhoneNewHandler(req, res) {
  try {
    const { phoneChangeToken, novoTelefone } = req.body || {};
    const result = await requestPhoneChangeNew({ phoneChangeToken, novoTelefone });
    if (!result.ok) {
      if (result.code === 'WAIT' || result.code === 'BLOCKED') {
        return res.status(429).json(result);
      }
      if (result.code === 'SMS_NOT_CONFIGURED') {
        return res.status(503).json(result);
      }
      if (result.code === 'SMS_PROVIDER_ERROR') {
        return res.status(502).json(result);
      }
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[ERRO_REQUEST_PHONE_NEW]:', err);
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Erro interno.' });
  }
}

export async function verifyPhoneNewHandler(req, res) {
  try {
    const { phoneChangeToken, novoTelefone, otp } = req.body || {};
    const result = await verifyPhoneChangeNew({ phoneChangeToken, novoTelefone, otp });
    if (!result.ok) {
      return res.status(result.code === 'BLOCKED' ? 429 : 400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[ERRO_VERIFY_PHONE_NEW]:', err);
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Erro interno.' });
  }
}
