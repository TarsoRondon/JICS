export function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

export function ensureNonNegativeInt(value) {
  const num = toInt(value);
  if (num === null || num < 0) return null;
  return num;
}
