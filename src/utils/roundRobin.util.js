export function generateRoundRobinMatches(teams) {
  const list = [...teams];
  const matches = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      matches.push({ home: list[i], away: list[j] });
    }
  }
  return matches;
}
