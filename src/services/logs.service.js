import { dbQuery } from '../db/conn.js';

export async function listLogs({ organization_id, from, to, q, admin_id, limit = 20, offset = 0 }) {
  const filters = ['organization_id = :organization_id'];
  const params = { organization_id, limit, offset };

  if (from) {
    filters.push('criado_em >= :from');
    params.from = from;
  }
  if (to) {
    filters.push('criado_em <= :to');
    params.to = to;
  }
  if (admin_id) {
    filters.push('admin_id = :admin_id');
    params.admin_id = admin_id;
  }
  if (q) {
    filters.push('(acao LIKE :q OR entidade LIKE :q OR admin_nome LIKE :q)');
    params.q = `%${q}%`;
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const totalRows = await dbQuery(
    `SELECT COUNT(*) AS total FROM logs ${where}`,
    params
  );

  const rows = await dbQuery(
    `SELECT id, organization_id, admin_id, admin_nome, acao, entidade, entidade_id, ip, user_agent, criado_em
     FROM logs
     ${where}
     ORDER BY criado_em DESC
     LIMIT :limit OFFSET :offset`,
    params
  );

  return { total: Number(totalRows[0]?.total || 0), items: rows };
}

