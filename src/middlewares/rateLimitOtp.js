const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 30;

const bucket = new Map();

function cleanup(now) {
  for (const [key, data] of bucket.entries()) {
    if (data.resetAt <= now) {
      bucket.delete(key);
    }
  }
}

export function rateLimitOtp(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  cleanup(now);

  const data = bucket.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  data.count += 1;
  bucket.set(ip, data);

  if (data.count > MAX_REQUESTS) {
    return res.status(429).json({ ok: false, code: 'RATE_LIMIT', message: 'Muitas tentativas. Tente novamente mais tarde.' });
  }

  return next();
}
