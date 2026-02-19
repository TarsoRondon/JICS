import { dbQuery } from '../db/conn.js';

let cachedCols = null;
let cachedStatusValues = null;

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

function resolveOrderExpr(cols) {
  if (cols.has('atualizado_em')) return 'j.atualizado_em';
  if (cols.has('updated_at')) return 'j.updated_at';
  if (cols.has('criado_em')) return 'j.criado_em';
  return 'j.id';
}

function parseEnumValues(type) {
  const raw = String(type || '').trim();
  const match = raw.match(/enum\((.*)\)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(v => v.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

async function getJogosStatusValues() {
  if (cachedStatusValues) return cachedStatusValues;
  const rows = await dbQuery(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'jogos'
       AND COLUMN_NAME = 'status'
     LIMIT 1`
  );
  cachedStatusValues = rows.length ? parseEnumValues(rows[0].COLUMN_TYPE) : [];
  return cachedStatusValues;
}

function pickStatusValue(values, candidates) {
  for (const c of candidates) {
    if (values.includes(c)) return c;
  }
  return values[0] || null;
}

export async function getTelaoPayload({ evento_id, organization_id }) {
  const cols = await getJogosCols();
  const statusValues = await getJogosStatusValues();
  const horaExpr = resolveTimeExpr(cols);
  const labelExpr = resolveLabelExpr(cols);
  const orderExpr = resolveOrderExpr(cols);
  const where = [];
  const params = {};
  if (cols.has('evento_id') && evento_id) {
    where.push('j.evento_id = :evento_id');
    params.evento_id = evento_id;
  }
  if (cols.has('organization_id') && organization_id) {
    where.push('j.organization_id = :organization_id');
    params.organization_id = organization_id;
  }
  const whereSql = `WHERE 1=1 ${where.length ? `AND ${where.join(' AND ')}` : ''}`;

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

  const statusRunning = pickStatusValue(statusValues, ['EM_ANDAMENTO', 'em_andamento', 'ANDAMENTO', 'IN_PROGRESS']);
  const statusPending = pickStatusValue(statusValues, ['NAO_INICIADO', 'SCHEDULED', 'agendado', 'PENDENTE']);
  const statusDone = pickStatusValue(statusValues, ['FINALIZADO', 'finalizado', 'DONE', 'ENCERRADO']);

  const em_andamento = await dbQuery(
    `${baseSelect} ${statusRunning ? 'AND j.status = :status_running' : ''}
     ORDER BY ${orderExpr} DESC, j.ordem ASC`,
    statusRunning ? { ...params, status_running: statusRunning } : params
  );

  const proximos = await dbQuery(
    `${baseSelect} ${statusPending ? 'AND j.status = :status_pending' : ''}
     ORDER BY j.ordem ASC, j.id ASC
     LIMIT 10`,
    statusPending ? { ...params, status_pending: statusPending } : params
  );

  const ultimos = await dbQuery(
    `${baseSelect} ${statusDone ? 'AND j.status = :status_done' : ''}
     ORDER BY ${orderExpr} DESC, j.id DESC
     LIMIT 5`,
    statusDone ? { ...params, status_done: statusDone } : params
  );

  return { em_andamento, proximos, ultimos };
}
