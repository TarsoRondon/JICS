import { dbQuery } from '../db/conn.js';

function getRequestIp(req) {
  const xfwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xfwd || req.ip || null;
}

export async function registrarLog({ req, admin, acao, entidade, entidade_id }) {
  try {
    const organizationId = admin?.organization_id || admin?.organizationId || req.organizationId || null;
    if (!organizationId) return;

    await dbQuery(
      `INSERT INTO logs
        (organization_id, admin_id, admin_nome, acao, entidade, entidade_id, ip, user_agent)
       VALUES
        (:organization_id, :admin_id, :admin_nome, :acao, :entidade, :entidade_id, :ip, :user_agent)`,
      {
        organization_id: organizationId,
        admin_id: admin?.id || null,
        admin_nome: admin?.nome || null,
        acao: String(acao || '').slice(0, 80),
        entidade: String(entidade || '').slice(0, 80),
        entidade_id: entidade_id != null ? String(entidade_id).slice(0, 80) : null,
        ip: getRequestIp(req),
        user_agent: String(req.headers['user-agent'] || '').slice(0, 255) || null,
      }
    );
  } catch {
    // Auditoria nunca deve derrubar a requisicao.
  }
}

