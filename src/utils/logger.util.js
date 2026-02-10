const SENSITIVE_KEYS = ['otp', 'codigo', 'code', 'body', 'message'];

function redactValue(value) {
  if (value == null) return value;
  if (typeof value === 'string') return '***';
  if (typeof value === 'number') return 0;
  return '***';
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const clean = Array.isArray(meta) ? [] : {};
  Object.keys(meta).forEach((key) => {
    if (SENSITIVE_KEYS.includes(key)) {
      clean[key] = redactValue(meta[key]);
      return;
    }
    const value = meta[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeMeta(value);
      return;
    }
    clean[key] = value;
  });
  return clean;
}

function logWith(level, event, meta) {
  const payload = sanitizeMeta(meta);
  const message = `[${event}]`;
  if (payload !== undefined) {
    console[level](message, payload);
  } else {
    console[level](message);
  }
}

export function logInfo(event, meta) {
  logWith('info', event, meta);
}

export function logWarn(event, meta) {
  logWith('warn', event, meta);
}

export function logError(event, meta) {
  logWith('error', event, meta);
}
