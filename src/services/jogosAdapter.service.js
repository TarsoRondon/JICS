import { dbQuery, pool } from '../db/conn.js';

let cachedJogosColumns = null;
let cachedStatusValues = null;
let cachedNextSlotValues = null;

export async function getJogosColumns() {
  if (cachedJogosColumns) return cachedJogosColumns;
  const rows = await dbQuery(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'jogos'`
  );
  cachedJogosColumns = new Set(rows.map(r => r.COLUMN_NAME));
  return cachedJogosColumns;
}

export async function getJogosStatusValues() {
  if (cachedStatusValues) return cachedStatusValues;
  const rows = await dbQuery(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'jogos'
       AND COLUMN_NAME = 'status'`
  );
  const colType = rows[0]?.COLUMN_TYPE || '';
  const values = colType
    .replace(/^enum\(/i, '')
    .replace(/\)$/i, '')
    .split(',')
    .map(v => v.replace(/'/g, '').trim())
    .filter(Boolean);
  cachedStatusValues = values;
  return values;
}

async function getEnumValues(columnName) {
  const rows = await dbQuery(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'jogos'
       AND COLUMN_NAME = :columnName`,
    { columnName }
  );
  const colType = rows[0]?.COLUMN_TYPE || '';
  return colType
    .replace(/^enum\(/i, '')
    .replace(/\)$/i, '')
    .split(',')
    .map(v => v.replace(/'/g, '').trim())
    .filter(Boolean);
}

export async function resolveStatusValues() {
  const values = await getJogosStatusValues();
  const lower = values.map(v => v.toLowerCase());
  if (lower.includes('nao_iniciado') && lower.includes('finalizado')) {
    return { scheduled: values[lower.indexOf('nao_iniciado')], done: values[lower.indexOf('finalizado')] };
  }
  if (lower.includes('agendado') && lower.includes('finalizado')) {
    return { scheduled: values[lower.indexOf('agendado')], done: values[lower.indexOf('finalizado')] };
  }
  if (lower.includes('scheduled') && lower.includes('done')) {
    return { scheduled: values[lower.indexOf('scheduled')], done: values[lower.indexOf('done')] };
  }
  return { scheduled: values[0] || 'SCHEDULED', done: values[1] || 'DONE' };
}

export async function resolveNextSlotValues() {
  if (cachedNextSlotValues) return cachedNextSlotValues;
  const cols = await getJogosColumns();
  if (!cols.has('next_slot')) {
    cachedNextSlotValues = { home: 'A', away: 'B' };
    return cachedNextSlotValues;
  }
  const values = await getEnumValues('next_slot');
  const lower = values.map(v => v.toLowerCase());
  if (lower.includes('home') && lower.includes('away')) {
    cachedNextSlotValues = {
      home: values[lower.indexOf('home')],
      away: values[lower.indexOf('away')],
    };
    return cachedNextSlotValues;
  }
  if (lower.includes('a') && lower.includes('b')) {
    cachedNextSlotValues = {
      home: values[lower.indexOf('a')],
      away: values[lower.indexOf('b')],
    };
    return cachedNextSlotValues;
  }
  cachedNextSlotValues = { home: values[0] || 'A', away: values[1] || 'B' };
  return cachedNextSlotValues;
}

export async function resolveNextColumns() {
  const cols = await getJogosColumns();
  return {
    nextIdCol: cols.has('next_jogo_id') ? 'next_jogo_id' : (cols.has('next_match_id') ? 'next_match_id' : null),
    nextSlotCol: cols.has('next_slot') ? 'next_slot' : null,
  };
}

export async function insertJogo(data) {
  const cols = await getJogosColumns();
  const fields = [];
  const values = [];
  const add = (col, val) => {
    if (!cols.has(col)) return;
    if (val === undefined) return;
    fields.push(col);
    values.push(val);
  };

  add('organization_id', data.organization_id);
  add('evento_id', data.evento_id);
  add('modalidade_id', data.modalidade_id);
  add('fase', data.fase);
  add('sexo', data.sexo);
  add('chave', data.chave);
  add('ordem', data.ordem);
  add('jogo_label', data.jogo_label);
  add('numero_jogo', data.numero_jogo);
  add('hora_oficial', data.hora_oficial);
  add('hora_texto', data.hora_texto);
  add('local', data.local);
  add('equipe_a', data.equipe_a);
  add('equipe_b', data.equipe_b);
  add('placar_a', data.placar_a);
  add('placar_b', data.placar_b);
  add('status', data.status);
  add('wo', data.wo);
  add('observacoes', data.observacoes);
  add('finalizado_em', data.finalizado_em);
  add('stage_id', data.stage_id);
  add('group_id', data.group_id);
  add('home_team_id', data.home_team_id);
  add('away_team_id', data.away_team_id);
  add('next_jogo_id', data.next_jogo_id);
  add('next_match_id', data.next_match_id);
  add('next_slot', data.next_slot);

  if (!fields.length) throw new Error('Nenhuma coluna valida para inserir em jogos.');
  const sql = `INSERT INTO jogos (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(',')})`;
  const [result] = await pool.query(sql, values);
  return result.insertId;
}

export async function updateJogo(id, data) {
  const cols = await getJogosColumns();
  const sets = [];
  const values = [];
  const add = (col, val) => {
    if (!cols.has(col)) return;
    if (val === undefined) return;
    sets.push(`${col} = ?`);
    values.push(val);
  };

  add('equipe_a', data.equipe_a);
  add('equipe_b', data.equipe_b);
  add('placar_a', data.placar_a);
  add('placar_b', data.placar_b);
  add('status', data.status);
  add('wo', data.wo);
  add('observacoes', data.observacoes);
  add('finalizado_em', data.finalizado_em);
  add('fase', data.fase);
  add('home_team_id', data.home_team_id);
  add('away_team_id', data.away_team_id);
  add('next_jogo_id', data.next_jogo_id);
  add('next_match_id', data.next_match_id);
  add('next_slot', data.next_slot);

  if (!sets.length) return;
  const sql = `UPDATE jogos SET ${sets.join(', ')} WHERE id = ?`;
  values.push(id);
  await pool.query(sql, values);
}
