import crypto from 'crypto';

export function hashSha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function generateOtp() {
  const num = crypto.randomInt(0, 1000000);
  return String(num).padStart(6, '0');
}

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function timingSafeEqualHex(a, b) {
  const aBuf = Buffer.from(String(a), 'hex');
  const bBuf = Buffer.from(String(b), 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
