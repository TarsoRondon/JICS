import { getAuthCookieName, verifyAdminToken } from '../utils/jwt.js';
import { getAdminById } from '../services/admins.service.js';

function parseToken(req) {
  const cookieName = getAuthCookieName();
  const cookieToken = req.cookies ? req.cookies[cookieName] : null;
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  return cookieToken || bearer || null;
}

export function attachAdminToReq(req, _res, next) {
  const token = parseToken(req);
  if (!token) {
    req.admin = null;
    return next();
  }
  try {
    const payload = verifyAdminToken(token);
    req.admin = payload;
    req.organizationId = payload.organization_id;
  } catch {
    req.admin = null;
  }
  return next();
}

export async function requireAuth(req, res, next) {
  if (!req.admin) {
    attachAdminToReq(req, res, () => {});
  }

  if (!req.admin || !req.admin.id) {
    return res.status(401).json({ sucesso: false, erro: { mensagem: 'Nao autenticado.' } });
  }

  const admin = await getAdminById(req.admin.id);
  if (!admin || !admin.ativo) {
    return res.status(401).json({ sucesso: false, erro: { mensagem: 'Sessao invalida.' } });
  }

  req.admin = admin;
  req.organizationId = admin.organization_id;
  return next();
}

export function requireOrg(req, res, next) {
  if (!req.organizationId) {
    return res.status(400).json({ sucesso: false, erro: { mensagem: 'Organizacao nao definida.' } });
  }
  return next();
}

