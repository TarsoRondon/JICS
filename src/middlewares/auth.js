import { getAuthCookieName, verifyAdminToken } from '../utils/jwt.js';
import { getAdminById } from '../services/admins.service.js';
import { dbQuery } from '../db/conn.js';

const SESSION_ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'STAFF', 'PROFESSOR']);
let cachedOrgId = null;
let cachedOrgAt = 0;
const ORG_CACHE_TTL = 5 * 60 * 1000;

function mapSessionRole(role) {
  const value = String(role || '').toUpperCase();
  if (!SESSION_ADMIN_ROLES.has(value)) return null;
  if (value === 'PROFESSOR') return 'STAFF';
  return value;
}

async function getDefaultOrganizationId() {
  const now = Date.now();
  if (cachedOrgId && now - cachedOrgAt < ORG_CACHE_TTL) return cachedOrgId;
  try {
    const rows = await dbQuery('SELECT id FROM organizations ORDER BY id ASC LIMIT 1');
    cachedOrgId = rows?.[0]?.id || null;
    cachedOrgAt = now;
    return cachedOrgId;
  } catch {
    return null;
  }
}

function parseToken(req) {
  const cookieName = getAuthCookieName();
  const cookieToken = req.cookies ? req.cookies[cookieName] : null;
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  return cookieToken || bearer || null;
}

export async function attachAdminToReq(req, _res, next) {
  const token = parseToken(req);
  if (!token) {
    req.admin = null;
  } else {
    try {
      const payload = verifyAdminToken(token);
      req.admin = payload;
      req.organizationId = payload.organization_id;
    } catch {
      req.admin = null;
    }
  }
  if (!req.admin) {
    const user = req.user || req.userSession?.user;
    const role = mapSessionRole(user?.role);
    if (role) {
      const orgId =
        user?.organization_id ||
        user?.organizationId ||
        req.organizationId ||
        (await getDefaultOrganizationId());
      if (orgId) {
        req.admin = {
          id: null,
          role,
          organization_id: orgId,
          nome: user?.nome || null,
          email: user?.email || null,
          source: 'session',
        };
        req.organizationId = orgId;
      }
    }
  }
  return next();
}

export async function requireAuth(req, res, next) {
  if (!req.admin) {
    await attachAdminToReq(req, res, () => {});
  }

  if (!req.admin || !req.admin.id) {
    if (req.admin?.source === 'session') {
      if (!req.organizationId) {
        return res.status(400).json({ sucesso: false, erro: { mensagem: 'Organizacao nao definida.' } });
      }
      return next();
    }
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
