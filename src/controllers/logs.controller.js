import { listLogs } from '../services/logs.service.js';

function jsonErro(res, status, mensagem, detalhes) {
  return res.status(status).json({ sucesso: false, erro: { mensagem, detalhes } });
}

function jsonOk(res, data) {
  return res.json({ sucesso: true, data });
}

export async function listarLogs(req, res) {
  const { from, to, q, admin_id } = req.query || {};
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  try {
    const result = await listLogs({
      organization_id: req.organizationId,
      from: from || null,
      to: to || null,
      q: q || null,
      admin_id: admin_id || null,
      limit,
      offset,
    });
    return jsonOk(res, result);
  } catch (err) {
    return jsonErro(res, 500, 'Erro ao listar logs.');
  }
}

