import { dbQuery } from '../db/conn.js';

export async function atualizarStatusJogo({ id, organization_id, status }) {
  const result = await dbQuery(
    `UPDATE jogos
     SET status = :status, atualizado_em = NOW()
     WHERE id = :id AND organization_id = :organization_id`,
    { id, organization_id, status }
  );
  return result.affectedRows || 0;
}

export async function atualizarPlacarJogo({ id, organization_id, placar_a, placar_b, status }) {
  const result = await dbQuery(
    `UPDATE jogos
     SET placar_a = :placar_a,
         placar_b = :placar_b,
         status = :status,
         atualizado_em = NOW()
     WHERE id = :id AND organization_id = :organization_id`,
    { id, organization_id, placar_a, placar_b, status }
  );
  return result.affectedRows || 0;
}

export async function buscarJogoPorId({ id, organization_id }) {
  const rows = await dbQuery(
    `SELECT id, evento_id
     FROM jogos
     WHERE id = :id AND organization_id = :organization_id
     LIMIT 1`,
    { id, organization_id }
  );
  return rows[0] || null;
}

export async function buscarJogosFinalizados({ organization_id, evento_id, modalidade_id, sexo }) {
  return dbQuery(
    `SELECT *
     FROM jogos
     WHERE organization_id = :organization_id
       AND evento_id = :evento_id
       AND modalidade_id = :modalidade_id
       AND sexo = :sexo
       AND status = 'FINALIZADO'`,
    { organization_id, evento_id, modalidade_id, sexo }
  );
}
