import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  normalizePhoneBR,
  maskPhoneBR,
  phonesMatch as phonesMatchUtil,
  extractPhones as extractPhonesUtil,
  pickMatchingPhone as pickMatchingPhoneUtil,
} from './phone.util.js';

const OTP_PEPPER = process.env.OTP_PEPPER || 'dev-otp-pepper-change-me';
const OTP_JWT_SECRET = process.env.OTP_JWT_SECRET || process.env.JWT_SECRET || 'dev-otp-jwt-secret';

export const OTP_CONFIG = {
  ttlMinutes: 5,
  resendSeconds: 60,
  maxAttempts: 5,
  blockMinutes: 10,
};

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizePhone(value) {
  return normalizePhoneBR(value);
}

export function phonesMatch(a, b) {
  return phonesMatchUtil(a, b);
}

export function extractPhones(value) {
  return extractPhonesUtil(value);
}

export function pickMatchingPhone(value, contact) {
  return pickMatchingPhoneUtil(value, contact);
}

export function maskEmail(email) {
  const safe = normalizeEmail(email);
  if (!safe.includes('@')) return safe;
  const [user, domain] = safe.split('@');
  const [dom, tld = ''] = domain.split('.');
  const maskPart = (part) => {
    if (!part) return '*';
    if (part.length <= 2) return `${part[0] || ''}*`;
    return `${part[0]}***${part.slice(-1)}`;
  };
  return `${maskPart(user)}@${maskPart(dom)}${tld ? '.' + tld : ''}`;
}

export function maskPhone(phone) {
  return maskPhoneBR(phone);
}

export function generateOtp() {
  const num = crypto.randomInt(0, 1000000);
  return String(num).padStart(6, '0');
}

export function hashOtp({ otp, matricula, finalidade }) {
  const payload = `${otp}${OTP_PEPPER}${matricula}${finalidade}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function isStrongPassword(value) {
  const senha = String(value || '');
  return (
    senha.length >= 8 &&
    /[A-Z]/.test(senha) &&
    /[0-9]/.test(senha) &&
    /[^A-Za-z0-9]/.test(senha)
  );
}

export function signOtpToken(payload, expiresIn = '10m') {
  return jwt.sign(payload, OTP_JWT_SECRET, {
    expiresIn,
    issuer: 'jics-ifro-esportes',
    audience: 'otp',
  });
}

export function verifyOtpToken(token) {
  return jwt.verify(token, OTP_JWT_SECRET, {
    issuer: 'jics-ifro-esportes',
    audience: 'otp',
  });
}
