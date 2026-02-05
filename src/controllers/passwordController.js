import { requestOtp, resetPassword, verifyOtp } from '../services/passwordService.js';

export async function solicitarOtp(req, res) {
  try {
    const { matricula, email } = req.body || {};
    const result = await requestOtp({ matricula, email });
    if (!result.ok) {
      return res.status(result.status || 400).json({ sucesso: false, mensagem: result.message });
    }
    return res.json({ sucesso: true, mensagem: result.message });
  } catch {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro interno.' });
  }
}

export async function validarOtp(req, res) {
  try {
    const { matricula, otp } = req.body || {};
    const result = await verifyOtp({ matricula, otp });
    if (!result.ok) {
      return res.status(result.status || 400).json({ sucesso: false, mensagem: result.message });
    }
    return res.json({
      sucesso: true,
      reset_token: result.resetToken,
      expira_em_minutos: result.expiresInMin
    });
  } catch {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro interno.' });
  }
}

export async function redefinirSenha(req, res) {
  try {
    const { matricula, reset_token, nova_senha } = req.body || {};
    const result = await resetPassword({ matricula, resetToken: reset_token, novaSenha: nova_senha });
    if (!result.ok) {
      return res.status(result.status || 400).json({ sucesso: false, mensagem: result.message });
    }
    return res.json({ sucesso: true, mensagem: 'Senha atualizada com sucesso.' });
  } catch {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro interno.' });
  }
}
