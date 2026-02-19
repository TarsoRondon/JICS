export function computeGroupSizes(total) {
  const n = Number(total || 0);
  if (n <= 0) return [];
  if (n <= 4) return [n];
  if (n === 5) return [5];

  const sizes = [];
  const mod = n % 3;
  if (mod === 0) {
    const count = Math.floor(n / 3);
    for (let i = 0; i < count; i += 1) sizes.push(3);
    return sizes;
  }
  if (mod === 1) {
    const count = Math.floor((n - 4) / 3);
    for (let i = 0; i < count; i += 1) sizes.push(3);
    sizes.push(4);
    return sizes;
  }
  // mod === 2
  if (n === 8) return [4, 4];
  const count = Math.floor((n - 8) / 3);
  for (let i = 0; i < count; i += 1) sizes.push(3);
  sizes.push(4, 4);
  return sizes;
}
