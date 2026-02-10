import {
  listAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  setAdminActive,
  getAdminById,
  findAdminByEmail,
} from '../services/admins.service.js';
import { registrarLog } from '../utils/logger.js';

function jsonErro(res, status, mensagem, detalhes) {
  return res.status(status).json({ sucesso: false, erro: { mensagem, detalhes } });
}

function jsonOk(res, data) {
  return res.json({ sucesso: true, data });
}

const roles = new Set(['SUPER_ADMIN', 'ADMIN', 'STAFF']);

function normalizeRole(value) {
  const role = String(value || '').toUpperCase();
  return roles.has(role) ? role : null;
}

export async function listarAdmins(req, res) {
  const orgId = req.organizationId;
  const rows = await listAdmins(orgId);
  return jsonOk(res, rows);
}

export async function criarAdmin(req, res) {
  const { nome, email, senha, role } = req.body || {};
  if (!nome || !email || !senha) {
    return jsonErro(res, 400, 'Nome, email e senha sao obrigatorios.');
  }

  const roleNorm = normalizeRole(role || 'STAFF');
  if (!roleNorm) return jsonErro(res, 400, 'Role invalida.');
  if (req.admin?.role !== 'SUPER_ADMIN' && roleNorm !== 'STAFF') {
    return jsonErro(res, 403, 'Permissao negada.');
  }

  const orgId = req.organizationId;
  const existente = await findAdminByEmail(orgId, email);
  if (existente) {
    return jsonErro(res, 409, 'Email ja cadastrado.');
  }

  const id = await createAdmin({
    organization_id: orgId,
    nome,
    email,
    senha,
    role: roleNorm,
  });

  await registrarLog({
    req,
    admin: req.admin,
    acao: 'CREATE',
    entidade: 'admin',
    entidade_id: id,
  });

  return jsonOk(res, { id });
}

export async function editarAdmin(req, res) {
  const { id } = req.params;
  const payload = req.body || {};

  const alvo = await getAdminById(id);
  if (!alvo || alvo.organization_id !== req.organizationId) {
    return jsonErro(res, 404, 'Admin nao encontrado.');
  }

  if (payload.role) {
    const roleNorm = normalizeRole(payload.role);
    if (!roleNorm) return jsonErro(res, 400, 'Role invalida.');
    if (roleNorm === 'SUPER_ADMIN' && req.admin.role !== 'SUPER_ADMIN') {
      return jsonErro(res, 403, 'Permissao negada.');
    }
    payload.role = roleNorm;
  }

  if (payload.email) {
    const existente = await findAdminByEmail(req.organizationId, payload.email);
    if (existente && String(existente.id) !== String(id)) {
      return jsonErro(res, 409, 'Email ja cadastrado.');
    }
  }

  const affected = await updateAdmin(id, payload);
  if (!affected) return jsonErro(res, 400, 'Nada para atualizar.');

  await registrarLog({
    req,
    admin: req.admin,
    acao: 'UPDATE',
    entidade: 'admin',
    entidade_id: id,
  });

  return jsonOk(res, { id });
}

export async function ativarAdmin(req, res) {
  const { id } = req.params;
  const { ativo } = req.body || {};
  const alvo = await getAdminById(id);
  if (!alvo || alvo.organization_id !== req.organizationId) {
    return jsonErro(res, 404, 'Admin nao encontrado.');
  }

  if (alvo.role === 'SUPER_ADMIN' && req.admin.role !== 'SUPER_ADMIN') {
    return jsonErro(res, 403, 'Permissao negada.');
  }

  await setAdminActive(id, Boolean(ativo));

  await registrarLog({
    req,
    admin: req.admin,
    acao: 'STATUS',
    entidade: 'admin',
    entidade_id: id,
  });

  return jsonOk(res, { id, ativo: Boolean(ativo) });
}

export async function removerAdmin(req, res) {
  const { id } = req.params;
  const alvo = await getAdminById(id);
  if (!alvo || alvo.organization_id !== req.organizationId) {
    return jsonErro(res, 404, 'Admin nao encontrado.');
  }

  if (alvo.role === 'SUPER_ADMIN') {
    return jsonErro(res, 403, 'Nao e permitido remover SUPER_ADMIN.');
  }

  const affected = await deleteAdmin(id);
  if (!affected) return jsonErro(res, 400, 'Nao foi possivel remover.');

  await registrarLog({
    req,
    admin: req.admin,
    acao: 'DELETE',
    entidade: 'admin',
    entidade_id: id,
  });

  return jsonOk(res, { id });
}
