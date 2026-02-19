import { dbQuery, pool } from '../db/conn.js';

let cachedStagesColumns = null;

async function getStagesColumns() {
  if (cachedStagesColumns) return cachedStagesColumns;
  const rows = await dbQuery(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'stages'`
  );
  cachedStagesColumns = new Set(rows.map(r => r.COLUMN_NAME));
  return cachedStagesColumns;
}

function stageTypeCol(cols) {
  return cols.has('type') ? 'type' : 'tipo';
}

function stageOrderCol(cols) {
  return cols.has('order_index') ? 'order_index' : 'ordem';
}

export async function createStage({ organization_id, evento_id, modalidade_id, sexo, nome, tipo, ordem, sort_on_entry = 0 }) {
  const cols = await getStagesColumns();
  const typeCol = stageTypeCol(cols);
  const orderCol = stageOrderCol(cols);
  const fields = [];
  const values = [];

  const push = (field, value) => {
    if (!cols.has(field) || value === undefined) return;
    fields.push(field);
    values.push(value);
  };

  push('organization_id', organization_id);
  push('evento_id', evento_id);
  push('modalidade_id', modalidade_id);
  push('sexo', sexo);
  push('nome', nome);
  push(typeCol, tipo);
  push(orderCol, ordem);
  push('sort_on_entry', sort_on_entry ? 1 : 0);
  push('status', cols.has('status') ? 'OPEN' : undefined);

  const [result] = await pool.query(
    `INSERT INTO stages (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
    values
  );

  return {
    id: result.insertId,
    organization_id,
    evento_id,
    modalidade_id,
    sexo,
    nome,
    [typeCol]: tipo,
    [orderCol]: ordem,
    sort_on_entry: sort_on_entry ? 1 : 0,
    status: cols.has('status') ? 'OPEN' : null,
  };
}

export async function listStages({ organization_id, evento_id, modalidade_id, sexo }) {
  const cols = await getStagesColumns();
  const orderCol = stageOrderCol(cols);
  const where = ['modalidade_id = :mod'];
  const params = { mod: modalidade_id };
  if (cols.has('organization_id') && organization_id !== undefined) {
    where.push('organization_id = :org');
    params.org = organization_id;
  }
  if (cols.has('evento_id') && evento_id !== undefined) {
    where.push('evento_id = :evento');
    params.evento = evento_id;
  }
  if (cols.has('sexo') && sexo) {
    where.push('sexo = :sexo');
    params.sexo = sexo;
  }
  return dbQuery(
    `SELECT *
     FROM stages
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderCol} ASC, id ASC`,
    params
  );
}

export async function getOpenStage({ organization_id, evento_id, modalidade_id, sexo }) {
  const cols = await getStagesColumns();
  const orderCol = stageOrderCol(cols);
  const where = ['modalidade_id = :mod'];
  const params = { mod: modalidade_id };
  if (cols.has('organization_id') && organization_id !== undefined) {
    where.push('organization_id = :org');
    params.org = organization_id;
  }
  if (cols.has('evento_id') && evento_id !== undefined) {
    where.push('evento_id = :evento');
    params.evento = evento_id;
  }
  if (cols.has('sexo') && sexo) {
    where.push('sexo = :sexo');
    params.sexo = sexo;
  }
  if (cols.has('status')) {
    where.push('status = \'OPEN\'');
  }
  const rows = await dbQuery(
    `SELECT *
     FROM stages
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderCol} DESC, id DESC
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

export async function closeStage(stageId) {
  const cols = await getStagesColumns();
  if (!cols.has('status')) return;
  await dbQuery(
    'UPDATE stages SET status = \"CLOSED\" WHERE id = :id',
    { id: stageId }
  );
}
