import { dbQuery } from '../db/conn.js';
import { signAdminToken, setAuthCookie, clearAuthCookie } from '../utils/jwt.js';
import { registrarLog } from '../utils/logger.js';
import {
  findAdminByEmail,
  findAdminByEmailGlobal,
  verifyPassword,
} from '../services/admins.service.js';

function jsonErro(res, status, mensagem, detalhes) {
  return res.status(status).json({ sucesso: false, erro: { mensagem, detalhes } });
}

function jsonOk(res, data) {
  return res.json({ sucesso: true, data });
}

async function resolveOrganization({ organization_id, organization_sigla }) {
  if (organization_id) {
    const rows = await dbQuery(
      'SELECT id, nome, sigla FROM organizations WHERE id = :id LIMIT 1',
      { id: organization_id }
    );
    return rows[0] || null;
  }

  if (organization_sigla) {
    const rows = await dbQuery(
      'SELECT id, nome, sigla FROM organizations WHERE sigla = :sigla LIMIT 1',
      { sigla: organization_sigla }
    );
    return rows[0] || null;
  }

  return null;
}

export async function adminLogin(req, res) {
  try {
    const { email, senha, organization_id, organization_sigla } = req.body || {};
    if (!email || !senha) {
      return jsonErro(res, 400, 'Email e senha sao obrigatorios.');
    }

    let admin = null;
    let org = null;

    if (organization_id || organization_sigla) {
      org = await resolveOrganization({ organization_id, organization_sigla });
      if (!org) {
        return jsonErro(res, 404, 'Organizacao nao encontrada.');
      }
      admin = await findAdminByEmail(org.id, email);
    } else {
      const admins = await findAdminByEmailGlobal(email);
      if (admins.length > 1) {
        return jsonErro(res, 400, 'Informe a organizacao para continuar.');
      }
      admin = admins[0] || null;
      if (admin) {
        org = await resolveOrganization({ organization_id: admin.organization_id });
      }
    }

    if (!admin) {
      return jsonErro(res, 401, 'Credenciais invalidas.');
    }

    if (!admin.ativo) {
      return jsonErro(res, 403, 'Conta desativada.');
    }

    const ok = await verifyPassword(senha, admin.senha_hash);
    if (!ok) {
      return jsonErro(res, 401, 'Credenciais invalidas.');
    }

    const token = signAdminToken({
      id: admin.id,
      organization_id: admin.organization_id,
      role: admin.role,
      nome: admin.nome,
      email: admin.email,
    });

    setAuthCookie(res, token);

    await registrarLog({
      req,
      admin,
      acao: 'LOGIN',
      entidade: 'admin',
      entidade_id: admin.id,
    });

    return jsonOk(res, {
      admin: {
        id: admin.id,
        nome: admin.nome,
        email: admin.email,
        role: admin.role,
        organization_id: admin.organization_id,
        ativo: admin.ativo,
      },
      organization: org || null,
    });
  } catch (err) {
    return jsonErro(res, 500, 'Erro interno.');
  }
}

export async function adminLogout(req, res) {
  try {
    if (req.admin?.id) {
      await registrarLog({
        req,
        admin: req.admin,
        acao: 'LOGOUT',
        entidade: 'admin',
        entidade_id: req.admin.id,
      });
    }
  } finally {
    clearAuthCookie(res);
    return res.json({ sucesso: true });
  }
}

export async function adminMe(req, res) {
  if (!req.admin) {
    return jsonErro(res, 401, 'Nao autenticado.');
  }
  const orgRows = await dbQuery(
    'SELECT id, nome, sigla FROM organizations WHERE id = :id LIMIT 1',
    { id: req.admin.organization_id }
  );

  const eventos = await dbQuery(
    `SELECT id, nome, ano, status, data_inicio, data_fim
     FROM eventos
     WHERE organization_id = :orgId AND status = 'ATIVO'
     ORDER BY ano DESC, data_inicio DESC
     LIMIT 1`,
    { orgId: req.admin.organization_id }
  );

  return jsonOk(res, {
    admin: req.admin,
    organization: orgRows[0] || null,
    evento_atual: eventos[0] || null,
  });
}

