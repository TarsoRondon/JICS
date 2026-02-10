import { getUserSession } from '../services/userSession.service.js';

const USER_SESSION_COOKIE = process.env.USER_SESSION_COOKIE || 'user_session';

function getCookie(req) {
  return req.cookies ? req.cookies[USER_SESSION_COOKIE] : null;
}

export function attachUserSession(req, _res, next) {
  const sessionId = getCookie(req);
  if (!sessionId) {
    req.userSession = null;
    return next();
  }
  const session = getUserSession(sessionId);
  req.userSession = session;
  return next();
}

export function requireUserSession(req, res, next) {
  attachUserSession(req, res, () => {});
  if (!req.userSession || !req.userSession.user) {
    return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
  }
  req.user = req.userSession.user;
  return next();
}

export function setUserSessionCookie(res, sessionId) {
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  res.cookie(USER_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
  });
}

export function clearUserSessionCookie(res) {
  res.clearCookie(USER_SESSION_COOKIE, { path: '/' });
}
