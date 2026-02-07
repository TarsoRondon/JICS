export function timeAgo(seconds) {
  if (seconds < 5) return 'agora mesmo';
  if (seconds < 60) return `ha ${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `ha ${min} min`;
  const h = Math.floor(min / 60);
  return `ha ${h}h`;
}
