import { dbQuery } from '../db/conn.js';

let cachedCols = null;

async function getJogosCols() {
  if (cachedCols) return cachedCols;
  const rows = await dbQuery(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'jogos'`
  );
  cachedCols = new Set(rows.map(r => r.COLUMN_NAME));
  return cachedCols;
}

function resolveTimeExpr(cols) {
  if (cols.has('hora_oficial')) return 'j.hora_oficial';
  if (cols.has('hora_texto')) return 'j.hora_texto';
  return 'NULL';
}

function resolveLabelExpr(cols) {
  if (cols.has('numero_jogo')) return 'j.numero_jogo';
  if (cols.has('jogo_label')) return 'j.jogo_label';
  return 'NULL';
}

export async function getTelaoPayload({ evento_id, organization_id }) {
  const cols = await getJogosCols();
  const horaExpr = resolveTimeExpr(cols);
  const labelExpr = resolveLabelExpr(cols);
  const where = ['j.evento_id = :evento_id'];
  const params = { evento_id };
  if (organization_id) {
    where.push('j.organization_id = :organization_id');
    params.organization_id = organization_id;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const baseSelect = `
    SELECT
      j.id,
      j.chave,
      j.status,
      j.equipe_a,
      j.equipe_b,
      j.placar_a,
      j.placar_b,
      ${horaExpr} AS hora,
      ${labelExpr} AS jogo_label,
      m.titulo AS modalidade
    FROM jogos j
    LEFT JOIN modalidades m ON m.id = j.modalidade_id
    ${whereSql}
  `;

  const em_andamento = await dbQuery(
    `${baseSelect} AND j.status = 'EM_ANDAMENTO'
     ORDER BY j.atualizado_em DESC, j.ordem ASC`,
    params
  );

  const proximos = await dbQuery(
    `${baseSelect} AND j.status = 'NAO_INICIADO'
     ORDER BY j.ordem ASC, j.id ASC
     LIMIT 10`,
    params
  );

  const ultimos = await dbQuery(
    `${baseSelect} AND j.status = 'FINALIZADO'
     ORDER BY j.atualizado_em DESC, j.id DESC
     LIMIT 5`,
    params
  );

  return { em_andamento, proximos, ultimos };
}

