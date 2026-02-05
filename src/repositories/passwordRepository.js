import { conectar } from '../../testeConexao.js';

async function withConnection(fn) {
  const conn = await conectar();
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

export function findAlunoByMatriculaAndEmail(matricula, email) {
  return withConnection(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, matricula, email_pessoal, nome
       FROM alunos
       WHERE matricula = ? AND LOWER(email_pessoal) = LOWER(?)`,
      [matricula, email]
    );
    return rows[0] || null;
  });
}

export function getLastOtpCreatedAt(matricula) {
  return withConnection(async (conn) => {
    const [rows] = await conn.query(
      `SELECT criado_em
       FROM password_otps
       WHERE matricula = ?
       ORDER BY criado_em DESC
       LIMIT 1`,
      [matricula]
    );
    return rows[0]?.criado_em || null;
  });
}

export function invalidateOtps(matricula) {
  return withConnection(async (conn) => {
    await conn.query(
      `UPDATE password_otps
       SET usado = 1
       WHERE matricula = ? AND usado = 0`,
      [matricula]
    );
  });
}

export function createOtp({ matricula, codigoHash, expiraEm }) {
  return withConnection(async (conn) => {
    await conn.query(
      `INSERT INTO password_otps (matricula, codigo_hash, expira_em)
       VALUES (?, ?, ?)`,
      [matricula, codigoHash, expiraEm]
    );
  });
}

export function getLatestOtpByMatricula(matricula) {
  return withConnection(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, codigo_hash, expira_em, tentativas, usado, criado_em
       FROM password_otps
       WHERE matricula = ?
       ORDER BY criado_em DESC
       LIMIT 1`,
      [matricula]
    );
    return rows[0] || null;
  });
}

export function incrementOtpAttempts(id) {
  return withConnection(async (conn) => {
    await conn.query(
      `UPDATE password_otps
       SET tentativas = tentativas + 1
       WHERE id = ?`,
      [id]
    );
  });
}

export function markOtpUsed(id) {
  return withConnection(async (conn) => {
    await conn.query(
      `UPDATE password_otps
       SET usado = 1
       WHERE id = ?`,
      [id]
    );
  });
}

export function invalidateResetTokens(matricula) {
  return withConnection(async (conn) => {
    await conn.query(
      `UPDATE password_reset_tokens
       SET usado = 1
       WHERE matricula = ? AND usado = 0`,
      [matricula]
    );
  });
}

export function createResetToken({ matricula, tokenHash, expiraEm }) {
  return withConnection(async (conn) => {
    await conn.query(
      `INSERT INTO password_reset_tokens (matricula, token_hash, expira_em)
       VALUES (?, ?, ?)`,
      [matricula, tokenHash, expiraEm]
    );
  });
}

export function getValidResetToken(matricula, tokenHash) {
  return withConnection(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, expira_em, usado
       FROM password_reset_tokens
       WHERE matricula = ? AND token_hash = ? AND usado = 0
       ORDER BY criado_em DESC
       LIMIT 1`,
      [matricula, tokenHash]
    );
    return rows[0] || null;
  });
}

export function markResetTokenUsed(id) {
  return withConnection(async (conn) => {
    await conn.query(
      `UPDATE password_reset_tokens
       SET usado = 1
       WHERE id = ?`,
      [id]
    );
  });
}

export function updateSenha(matricula, senhaPlain) {
  return withConnection(async (conn) => {
    await conn.query(
      `UPDATE alunos
       SET senha = SHA2(?, 256)
       WHERE matricula = ?`,
      [senhaPlain, matricula]
    );
  });
}
