import dotenv from 'dotenv';
dotenv.config({ override: true });
import { verifySmtpConnection, sendOtpEmail } from './src/services/email.service.js';

async function main() {
  console.log('=== TESTE DE DIAGNÓSTICO DE E-MAIL (SMTP) ===\n');

  console.log('Configurações atuais detectadas no .env:');
  console.log(`- SMTP_HOST: ${process.env.SMTP_HOST || '(não definido)'}`);
  console.log(`- SMTP_PORT: ${process.env.SMTP_PORT || '(não definido)'}`);
  console.log(`- SMTP_USER: ${process.env.SMTP_USER || '(não definido)'}`);
  console.log(`- SMTP_PASS: ${process.env.SMTP_PASS ? '******** (definida)' : '(não definido)'}`);
  console.log(`- SMTP_FROM: ${process.env.SMTP_FROM || '(padrão SMTP_USER)'}\n`);

  console.log('1. Testando conexão com o servidor SMTP...');
  try {
    await verifySmtpConnection();
    console.log('✔ Conexão SMTP autenticada com SUCESSO!\n');
  } catch (err) {
    console.error('❌ Falha na verificação SMTP:');
    console.error(`- Código de erro: ${err.code || 'N/A'}`);
    console.error(`- Resposta do servidor: ${err.response || err.message}\n`);

    if (err.code === 'EAUTH' || (err.response && err.response.includes('535'))) {
      console.log('📌 DIAGNÓSTICO: ERRO DE AUTENTICAÇÃO (Bad Credentials)');
      console.log('Como você está usando o Gmail (smtp.gmail.com):');
      console.log('1. Acesse https://myaccount.google.com/security');
      console.log('2. Certifique-se de que a "Verificação em 2 etapas" está ATIVADA.');
      console.log('3. Acesse "Senhas de app" (https://myaccount.google.com/apppasswords).');
      console.log('4. Crie uma nova senha de app com o nome "IFRO Esportes".');
      console.log('5. Copie a chave gerada de 16 letras (ex: abcd efgh ijkl mnop) e cole no SMTP_PASS do seu arquivo .env (sem espaços).');
    }
    process.exit(1);
  }

  const destinatarioTeste = process.argv[2] || process.env.SMTP_USER;
  if (destinatarioTeste) {
    console.log(`2. Enviando e-mail de teste para: ${destinatarioTeste}...`);
    try {
      const info = await sendOtpEmail({
        to: destinatarioTeste,
        nome: 'Administrador de Teste',
        matricula: '2026TESTE',
        otp: '123456',
        finalidade: 'RESET_PASSWORD'
      });
      console.log('✔ E-mail enviado com sucesso! Message ID:', info.messageId);
    } catch (sendErr) {
      console.error('❌ Falha no envio do e-mail:', sendErr.message);
    }
  }
}

main();
