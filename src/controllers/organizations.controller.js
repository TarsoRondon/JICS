import { dbQuery } from '../db/conn.js';

function jsonErro(res, status, mensagem) {
  return res.status(status).json({ sucesso: false, erro: { mensagem } });
}

function jsonOk(res, data) {
  return res.json({ sucesso: true, data });
}

export async function listarOrganizacoes(req, res) {
  try {
    const role = String(req.admin?.role || '').toUpperCase();
    const orgId = req.admin?.organization_id;
    const params = {};
    let where = '';
    if (role !== 'SUPER_ADMIN' && orgId) {
      where = 'WHERE id = :orgId';
      params.orgId = orgId;
    }

    const rows = await dbQuery(
      `SELECT id, nome, sigla, criado_em
       FROM organizations
       ${where}
       ORDER BY criado_em DESC, id DESC`,
      params
    );

    return jsonOk(res, rows || []);
  } catch (err) {
    return jsonErro(res, 500, 'Erro ao carregar organizacoes.');
  }
}

export async function criarOrganizacao(req, res) {
  try {
    const nome = String(req.body?.nome || '').trim();
    const siglaRaw = String(req.body?.sigla || '').trim();
    const sigla = siglaRaw ? siglaRaw.toUpperCase() : null;

    if (!nome) {
      return jsonErro(res, 400, 'Nome obrigatorio.');
    }

    const result = await dbQuery(
      `INSERT INTO organizations (nome, sigla)
       VALUES (:nome, :sigla)`,
      { nome, sigla }
    );

    return jsonOk(res, {
      id: result?.insertId || null,
      nome,
      sigla,
    });
  } catch (err) {
    return jsonErro(res, 500, 'Erro ao criar organizacao.');
  }
}
