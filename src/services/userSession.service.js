import crypto from 'crypto';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

function cleanup(now) {
  for (const [key, data] of sessions.entries()) {
    if (data.expiresAt <= now) {
      sessions.delete(key);
    }
  }
}

export function createUserSession(user) {
  const now = Date.now();
  cleanup(now);
  const id = crypto.randomBytes(24).toString('hex');
  sessions.set(id, { user, expiresAt: now + SESSION_TTL_MS });
  return id;
}

export function getUserSession(id) {
  if (!id) return null;
  const now = Date.now();
  cleanup(now);
  const data = sessions.get(id);
  if (!data) return null;
  if (data.expiresAt <= now) {
    sessions.delete(id);
    return null;
  }
  return data;
}

export function clearUserSession(id) {
  if (!id) return;
  sessions.delete(id);
}
