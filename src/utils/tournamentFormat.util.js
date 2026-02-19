function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function resolveFormatByModalidadeName(nome) {
  const t = normalize(nome);
  if (t.includes('futebol 7') || t.includes('futebol sete')) return 'A';
  if (t.includes('areia') && t.includes('volei')) return 'B';
  if (t.includes('futsal')) return 'C';
  if (t.includes('voleibol') || t.includes('volei')) return 'C';
  return 'C';
}
