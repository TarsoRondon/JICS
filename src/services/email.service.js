import dotenv from 'dotenv';
dotenv.config({ override: true });
import nodemailer from 'nodemailer';

export function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('CONFIGURACAO_SMTP_INCOMPLETA: Verifique SMTP_HOST, SMTP_USER e SMTP_PASS no arquivo .env');
  }

  const isSecure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

function otpEmailHtml({ nome, matricula, otp, finalidade }) {
  const safeNome = nome ? `, ${nome}` : '';
  const titulo = finalidade === 'FIRST_ACCESS' ? 'Ativação de conta' : 'Recuperação de senha';
  return `
    <div style="background:#f6f7fb;padding:24px">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e9edf5;">
        <div style="background:linear-gradient(90deg,#0d7a6b,#18c3b6);padding:18px 22px;">
          <h1 style="margin:0;color:#fff;font-family:Arial,sans-serif;font-size:18px;">${titulo} - IFRO Esportes</h1>
        </div>
        <div style="padding:22px;font-family:Arial,sans-serif;color:#1f2937;">
          <p style="margin:0 0 12px;">Olá${safeNome}.</p>
          <p style="margin:0 0 14px;">Use o código abaixo para confirmar sua solicitação:</p>
          <div style="background:#f3f7ff;border:1px solid #dbe7ff;border-radius:10px;padding:14px;margin:14px 0;">
            <p style="margin:0;font-size:24px;font-weight:700;letter-spacing:4px;text-align:center;color:#0d7a6b;">${otp}</p>
          </div>
          <p style="margin:0 0 8px;font-size:13px;color:#4b5563;">Código válido por 5 minutos. Não compartilhe este código.</p>
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">Matrícula: <b>${matricula}</b></p>
          <div style="margin-top:18px;padding-top:14px;border-top:1px solid #eee;color:#6b7280;font-size:12px;">
            Se você não solicitou esta operação, ignore este e-mail.
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function verifySmtpConnection() {
  const transporter = getTransporter();
  return transporter.verify();
}

export async function sendOtpEmail({ to, nome, matricula, otp, finalidade }) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const titulo = finalidade === 'FIRST_ACCESS' ? 'Código de ativação de conta' : 'Código de verificação';

  return transporter.sendMail({
    from,
    to,
    subject: `${titulo} - IFRO Esportes`,
    html: otpEmailHtml({ nome, matricula, otp, finalidade })
  });
}

