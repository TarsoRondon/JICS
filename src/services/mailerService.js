import { getTransporter, sendOtpEmail as sendOtpEmailService, verifySmtpConnection } from './email.service.js';

export async function sendOtpEmail({ to, nome, matricula, otp, finalidade = 'RESET_PASSWORD' }) {
  return sendOtpEmailService({ to, nome, matricula, otp, finalidade });
}

export { getTransporter, verifySmtpConnection };

