import jwt from 'jsonwebtoken';

const ADMIN_COOKIE = process.env.ADMIN_AUTH_COOKIE || 'admin_token';
let warnedInsecureSecret = false;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;

  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (isProd) {
    throw new Error('JWT_SECRET ausente em producao.');
  }

  if (!warnedInsecureSecret) {
    warnedInsecureSecret = true;
    console.warn('[auth] JWT_SECRET ausente. Usando chave de desenvolvimento temporaria.');
  }
  return 'dev-insecure-secret-change-me';
}

export function signAdminToken(payload, options = {}) {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, {
    expiresIn: options.expiresIn || process.env.JWT_EXPIRES_IN || '8h',
    issuer: options.issuer || 'jics-ifro-esportes',
    audience: options.audience || 'admin',
  });
}

export function verifyAdminToken(token) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret, {
    issuer: 'jics-ifro-esportes',
    audience: 'admin',
  });
}

export function getAuthCookieName() {
  return ADMIN_COOKIE;
}

export function getAuthCookieOptions() {
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  };
}

export function setAuthCookie(res, token) {
  res.cookie(ADMIN_COOKIE, token, getAuthCookieOptions());
}

export function clearAuthCookie(res) {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
}
