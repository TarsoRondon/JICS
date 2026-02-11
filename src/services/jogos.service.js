import { dbQuery } from '../db/conn.js';

let cachedJogosColumns = null;

async function getJogosColumns() {
  if (cachedJogosColumns) return cachedJogosColumns;
  const rows = await dbQuery(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'jogos'`
  );
  const cols = new Set(rows.map(r => r.COLUMN_NAME));
  cachedJogosColumns = cols;
  return cols;
}

export async function atualizarStatusJogo({ id, organization_id, status }) {
  const cols = await getJogosColumns();
  const hasOrg = cols.has('organization_id');
  const result = await dbQuery(
    `UPDATE jogos
     SET status = :status, atualizado_em = NOW()
     WHERE id = :id${hasOrg ? ' AND organization_id = :organization_id' : ''}`,
    hasOrg ? { id, organization_id, status } : { id, status }
  );
  return result.affectedRows || 0;
}

export async function atualizarPlacarJogo({ id, organization_id, placar_a, placar_b, status }) {
  const cols = await getJogosColumns();
  const hasOrg = cols.has('organization_id');
  const result = await dbQuery(
    `UPDATE jogos
     SET placar_a = :placar_a,
         placar_b = :placar_b,
         status = :status,
         atualizado_em = NOW()
     WHERE id = :id${hasOrg ? ' AND organization_id = :organization_id' : ''}`,
    hasOrg
      ? { id, organization_id, placar_a, placar_b, status }
      : { id, placar_a, placar_b, status }
  );
  return result.affectedRows || 0;
}

export async function buscarJogoPorId({ id, organization_id }) {
  const cols = await getJogosColumns();
  const hasOrg = cols.has('organization_id');
  const rows = await dbQuery(
    `SELECT id, evento_id
     FROM jogos
     WHERE id = :id${hasOrg ? ' AND organization_id = :organization_id' : ''}
     LIMIT 1`,
    hasOrg ? { id, organization_id } : { id }
  );
  return rows[0] || null;
}

export async function buscarJogosFinalizados({ organization_id, evento_id, modalidade_id, sexo }) {
  const cols = await getJogosColumns();
  const hasOrg = cols.has('organization_id');
  return dbQuery(
    `SELECT *
     FROM jogos
     WHERE ${hasOrg ? 'organization_id = :organization_id AND' : ''}
       evento_id = :evento_id
       AND modalidade_id = :modalidade_id
       AND sexo = :sexo
       AND status = 'FINALIZADO'`,
    hasOrg
      ? { organization_id, evento_id, modalidade_id, sexo }
      : { evento_id, modalidade_id, sexo }
  );
}
