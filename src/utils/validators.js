export function normalizeMatricula(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isValidMatricula(value) {
  const matricula = normalizeMatricula(value);
  return matricula.length === 13;
}

export function isValidEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidOtp(value) {
  return /^\d{6}$/.test(String(value || ''));
}

export function isValidPassword(value) {
  const senha = String(value || '');
  return senha.length >= 8 && senha.length <= 72;
}
