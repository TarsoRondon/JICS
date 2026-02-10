import { conectar } from '../../testeConexao.js';

async function withConnection(fn) {
  const conn = await conectar();
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

export function getAlunoByMatricula(matricula) {
  return withConnection(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, matricula, nome, email_pessoal, email_academico, telefone
       FROM alunos
       WHERE matricula = ?
       LIMIT 1`,
      [matricula]
    );
    return rows[0] || null;
  });
}

export function getLatestOtpStatus({ matricula, finalidade, canal }) {
  return withConnection(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, codigo_hash, expira_em, tentativas, usado, criado_em, canal, destino,
              ultimo_envio_em, bloqueado_ate
       FROM password_otps
       WHERE matricula = ? AND finalidade = ? AND canal = ?
       ORDER BY criado_em DESC
       LIMIT 1`,
      [matricula, finalidade, canal]
    );
    return rows[0] || null;
  });
}

export function getLatestOtpActive({ matricula, finalidade, destino = null }) {
  return withConnection(async (conn) => {
    let sql = `SELECT id, codigo_hash, expira_em, tentativas, usado, criado_em, canal, destino, bloqueado_ate
               FROM password_otps
               WHERE matricula = ? AND finalidade = ? AND usado = 0`;
    const params = [matricula, finalidade];
    if (destino) {
      sql += ' AND destino = ?';
      params.push(destino);
    }
    sql += ' ORDER BY criado_em DESC LIMIT 1';
    const [rows] = await conn.query(sql, params);
    return rows[0] || null;
  });
}

export function invalidateOtpsByFinalidade(matricula, finalidade) {
  return withConnection(async (conn) => {
    await conn.query(
      `UPDATE password_otps
       SET usado = 1
       WHERE matricula = ? AND finalidade = ? AND usado = 0`,
      [matricula, finalidade]
    );
  });
}

export function createOtp({ matricula, codigoHash, expiraEm, finalidade, canal, destino, ultimoEnvioEm }) {
  return withConnection(async (conn) => {
    await conn.query(
      `INSERT INTO password_otps
        (matricula, codigo_hash, expira_em, finalidade, canal, destino, ultimo_envio_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [matricula, codigoHash, expiraEm, finalidade, canal, destino, ultimoEnvioEm]
    );
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

export function updateOtpBlock(id, bloqueadoAte) {
  return withConnection(async (conn) => {
    await conn.query(
      `UPDATE password_otps
       SET bloqueado_ate = ?
       WHERE id = ?`,
      [bloqueadoAte, id]
    );
  });
}

export function updateAlunoSenha(matricula, senhaPlain) {
  return withConnection(async (conn) => {
    await conn.query(
      `UPDATE alunos
       SET senha = SHA2(?, 256)
       WHERE matricula = ?`,
      [senhaPlain, matricula]
    );
  });
}

export function updateAlunoTelefone(matricula, telefone) {
  return withConnection(async (conn) => {
    await conn.query(
      `UPDATE alunos
       SET telefone = ?
       WHERE matricula = ?`,
      [telefone, matricula]
    );
  });
}
