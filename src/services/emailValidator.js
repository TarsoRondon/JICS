import dns from 'dns';

const EMAIL_MAX_LENGTH = 254;
const LOCAL_MAX_LENGTH = 64;
const DNS_TIMEOUT_MS = 1500;
const disposableDomains = new Set([
  'mailinator.com',
  '10minutemail.com',
  '10minutemail.net',
  'guerrillamail.com',
  'guerrillamail.net',
  'temp-mail.org',
  'tempmail.com',
  'yopmail.com',
  'yopmail.net',
  'dispostable.com',
  'trashmail.com'
]);

const typoMap = {
  'gmal.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'icloud.con': 'icloud.com'
};

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidFormat(email) {
  if (!email || email.length > EMAIL_MAX_LENGTH) return false;
  const at = email.indexOf('@');
  if (at <= 0 || at === email.length - 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > LOCAL_MAX_LENGTH || domain.length < 3) return false;
  if (email.includes('..')) return false;
  const basic = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return basic.test(email);
}

export function isDisposable(email) {
  const domain = email.split('@')[1] || '';
  return disposableDomains.has(domain);
}

function applyTypoCorrection(email) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return { corrected: email, suggestion: '' };
  if (typoMap[domain]) {
    const corrected = `${local}@${typoMap[domain]}`;
    return { corrected, suggestion: corrected };
  }
  return { corrected: email, suggestion: '' };
}

export async function hasMXRecord(domain) {
  if (!domain) return false;
  try {
    const lookup = dns.promises.resolveMx(domain);
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('DNS_TIMEOUT')), DNS_TIMEOUT_MS);
    });
    const records = await Promise.race([lookup, timeout]);
    return Array.isArray(records) && records.length > 0;
  } catch (err) {
    // Em caso de timeout ou DNS indisponível, devolvemos null para não bloquear o usuário.
    if (err?.message === 'DNS_TIMEOUT' || err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') {
      return null;
    }
    return false;
  }
}

export async function validateEmail(email) {
  const normalized = normalizeEmail(email);
  if (!isValidFormat(normalized)) {
    return { valid: false, reason: 'formato_invalido', suggestion: '' };
  }
  if (isDisposable(normalized)) {
    return { valid: false, reason: 'temporario', suggestion: '' };
  }

  const { corrected, suggestion } = applyTypoCorrection(normalized);
  if (suggestion && suggestion !== normalized) {
    return { valid: false, reason: 'sugestao', suggestion };
  }

  const domain = (corrected.split('@')[1] || '').trim();
  const hasMx = await hasMXRecord(domain);
  if (hasMx === false) {
    return { valid: false, reason: 'dominio_inexistente', suggestion: '' };
  }
  // hasMx === null => DNS indisponível/timeout; liberamos para não travar o fluxo.

  return { valid: true, reason: '', suggestion: '' };
}
