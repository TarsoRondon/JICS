const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const bucket = new Map();
const MAX_BUCKET_SIZE = 5000;
let lastCleanupAt = 0;

function now() {
  return Date.now();
}

function cleanup(ts) {
  if (ts - lastCleanupAt < 30 * 1000 && bucket.size < MAX_BUCKET_SIZE) return;
  for (const [key, value] of bucket.entries()) {
    if (value.resetAt <= ts) bucket.delete(key);
  }
  if (bucket.size > MAX_BUCKET_SIZE) {
    const overflow = bucket.size - MAX_BUCKET_SIZE;
    let removed = 0;
    for (const [key] of bucket.entries()) {
      bucket.delete(key);
      removed += 1;
      if (removed >= overflow) break;
    }
  }
  lastCleanupAt = ts;
}

function getIp(req) {
  const xfwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xfwd || req.ip || req.connection?.remoteAddress || 'unknown';
}

export function rateLimitAuth(req, res, next) {
  const ts = now();
  cleanup(ts);
  const user = String(req.body?.usuario || req.body?.matricula || '').slice(0, 64);
  const key = `${getIp(req)}::${user}`;
  const state = bucket.get(key) || { count: 0, resetAt: ts + WINDOW_MS };
  if (state.resetAt <= ts) {
    state.count = 0;
    state.resetAt = ts + WINDOW_MS;
  }
  state.count += 1;
  bucket.set(key, state);

  if (state.count > MAX_ATTEMPTS) {
    const retryAfterSec = Math.max(1, Math.ceil((state.resetAt - ts) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      sucesso: false,
      erro: {
        mensagem: 'Muitas tentativas de login. Tente novamente em alguns minutos.',
        tentativas_max: MAX_ATTEMPTS,
        tente_novamente_em_segundos: retryAfterSec,
      },
    });
  }
  return next();
}
