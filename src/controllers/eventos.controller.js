import { dbQuery } from '../db/conn.js';

function jsonErro(res, status, mensagem) {
  return res.status(status).json({ sucesso: false, erro: { mensagem } });
}

function jsonOk(res, data) {
  return res.json({ sucesso: true, data });
}

const STATUS_VALIDO = new Set(['ABERTO', 'EM_ANDAMENTO', 'ENCERRADO']);

export async function listarEventos(req, res) {
  try {
    const orgId = req.organizationId;
    if (!orgId) return jsonErro(res, 400, 'Organizacao nao definida.');

    const rows = await dbQuery(
      `SELECT id, organization_id, nome, ano, data_inicio, data_fim, status, criado_em
       FROM eventos
       WHERE organization_id = :orgId
       ORDER BY ano DESC, data_inicio DESC, id DESC`,
      { orgId }
    );

    return jsonOk(res, rows || []);
  } catch (err) {
    return jsonErro(res, 500, 'Erro ao carregar eventos.');
  }
}

export async function criarEvento(req, res) {
  try {
    const orgId = req.organizationId || Number(req.body?.organization_id || 0);
    if (!orgId) return jsonErro(res, 400, 'Organizacao nao definida.');

    const nome = String(req.body?.nome || '').trim();
    const ano = Number(req.body?.ano || 0);
    const data_inicio = req.body?.data_inicio || null;
    const data_fim = req.body?.data_fim || null;
    const statusRaw = String(req.body?.status || 'ABERTO').toUpperCase();
    const status = STATUS_VALIDO.has(statusRaw) ? statusRaw : 'ABERTO';

    if (!nome || !ano) {
      return jsonErro(res, 400, 'Nome e ano sao obrigatorios.');
    }

    const result = await dbQuery(
      `INSERT INTO eventos (organization_id, nome, ano, data_inicio, data_fim, status)
       VALUES (:orgId, :nome, :ano, :data_inicio, :data_fim, :status)`,
      { orgId, nome, ano, data_inicio, data_fim, status }
    );

    return jsonOk(res, {
      id: result?.insertId || null,
      organization_id: orgId,
      nome,
      ano,
      data_inicio,
      data_fim,
      status,
    });
  } catch (err) {
    return jsonErro(res, 500, 'Erro ao criar evento.');
  }
}
