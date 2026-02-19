import { dbQuery } from '../db/conn.js';

export async function getTeamsFromInscricoes({ modalidade_id, sexo }) {
  let hasSexo = true;
  try {
    const cols = await dbQuery(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'alunos'
         AND COLUMN_NAME = 'sexo'`
    );
    hasSexo = cols.length > 0;
  } catch (_) {
    hasSexo = false;
  }

  const rows = await dbQuery(
    `SELECT DISTINCT TRIM(a.turma) AS team_label
     FROM inscricoes i
     JOIN alunos a ON a.id = i.aluno_id
     WHERE i.modalidade_id = :modalidade_id
       ${hasSexo ? 'AND (:sexo IS NULL OR a.sexo = :sexo)' : ''}
       AND a.turma IS NOT NULL
       AND TRIM(a.turma) <> ''
     ORDER BY TRIM(a.turma) ASC`,
    { modalidade_id, sexo: sexo || null }
  );
  return rows
    .map(r => ({ label: String(r.team_label || '').replace(/\s+/g, ' ').trim() }))
    .filter(r => r.label && r.label !== '-');
}
