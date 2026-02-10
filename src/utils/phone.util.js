export function normalizePhoneBR(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function validateBR(digits) {
  const clean = normalizePhoneBR(digits);
  return clean.length === 11;
}

export function toE164BR(digits) {
  const clean = normalizePhoneBR(digits);
  if (!clean) return '';
  if (clean.startsWith('55') && clean.length === 13) {
    return `+${clean}`;
  }
  if (clean.length === 11) {
    return `+55${clean}`;
  }
  return '';
}

export function maskPhoneBR(phone) {
  const digits = normalizePhoneBR(phone);
  if (digits.length < 4) return '(**) ****-****';
  const ddd = digits.slice(0, 2) || '**';
  const last4 = digits.slice(-4);
  return `(${ddd}) *****-${last4}`;
}

export function phonesMatch(a, b) {
  const na = normalizePhoneBR(a);
  const nb = normalizePhoneBR(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const minLen = Math.min(na.length, nb.length);
  if (minLen < 8) return false;
  if (na.endsWith(nb) || nb.endsWith(na)) return true;
  const tailLen = Math.min(minLen, 8);
  return na.slice(-tailLen) === nb.slice(-tailLen);
}

export function extractPhones(value) {
  const raw = String(value || '');
  if (!raw) return [];
  const parts = raw.split(/[;,|]/);
  const phones = parts
    .map((part) => normalizePhoneBR(part))
    .filter(Boolean);
  return Array.from(new Set(phones));
}

export function pickMatchingPhone(value, contact) {
  const list = Array.isArray(value) ? value : extractPhones(value);
  if (!list.length) return '';
  const match = contact ? list.find((phone) => phonesMatch(phone, contact)) : '';
  if (match) return match;
  if (list.length === 1) return list[0];
  return '';
}
