import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }
});

function otpEmailHtml({ nome, matricula, otp, finalidade }) {
  const safeNome = nome ? `, ${nome}` : '';
  const titulo = finalidade === 'FIRST_ACCESS' ? 'Ativacao de conta' : 'Recuperacao de senha';
  return `
    <div style="background:#f6f7fb;padding:24px">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e9edf5;">
        <div style="background:linear-gradient(90deg,#0d7a6b,#18c3b6);padding:18px 22px;">
          <h1 style="margin:0;color:#fff;font-family:Arial,sans-serif;font-size:18px;">${titulo} - IFRO Esportes</h1>
        </div>
        <div style="padding:22px;font-family:Arial,sans-serif;color:#1f2937;">
          <p style="margin:0 0 12px;">Ola${safeNome}.</p>
          <p style="margin:0 0 14px;">Use o codigo abaixo para confirmar sua solicitacao:</p>
          <div style="background:#f3f7ff;border:1px solid #dbe7ff;border-radius:10px;padding:14px;margin:14px 0;">
            <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:2px;text-align:center;">${otp}</p>
          </div>
          <p style="margin:0 0 8px;font-size:13px;color:#4b5563;">Codigo valido por 5 minutos. Nao compartilhe este codigo.</p>
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">Matricula: <b>${matricula}</b></p>
          <div style="margin-top:18px;padding-top:14px;border-top:1px solid #eee;color:#6b7280;font-size:12px;">
            Se voce nao solicitou esta operacao, ignore este email.
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function sendOtpEmail({ to, nome, matricula, otp, finalidade }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  return transporter.sendMail({
    from,
    to,
    subject: 'Codigo de verificacao - IFRO Esportes',
    html: otpEmailHtml({ nome, matricula, otp, finalidade })
  });
}
