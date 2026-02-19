function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'finalizado' || s === 'finalizada' || s === 'done') return 'DONE';
  if (s === 'em_andamento') return 'LIVE';
  return 'PENDING';
}

function initTeam(map, label) {
  if (!map[label]) {
    map[label] = {
      team: label,
      pontos: 0,
      saldo: 0,
      pro: 0,
      contra: 0,
      jogos: 0,
      vitorias: 0,
      empates: 0,
      derrotas: 0,
    };
  }
}

function applyMatch(stats, a, b, ga, gb) {
  initTeam(stats, a);
  initTeam(stats, b);
  const ta = stats[a];
  const tb = stats[b];
  ta.jogos += 1;
  tb.jogos += 1;
  ta.pro += ga;
  ta.contra += gb;
  tb.pro += gb;
  tb.contra += ga;
  ta.saldo = ta.pro - ta.contra;
  tb.saldo = tb.pro - tb.contra;
  if (ga > gb) {
    ta.vitorias += 1;
    tb.derrotas += 1;
    ta.pontos += 3;
  } else if (gb > ga) {
    tb.vitorias += 1;
    ta.derrotas += 1;
    tb.pontos += 3;
  } else {
    ta.empates += 1;
    tb.empates += 1;
    ta.pontos += 1;
    tb.pontos += 1;
  }
}

function baseSort(a, b) {
  if (b.pontos !== a.pontos) return b.pontos - a.pontos;
  if (b.saldo !== a.saldo) return b.saldo - a.saldo;
  if (b.pro !== a.pro) return b.pro - a.pro;
  return 0;
}

function buildStatsFromMatches(matches, teamsFilter = null) {
  const stats = {};
  matches.forEach((m) => {
    const status = normalizeStatus(m.status);
    if (status !== 'DONE') return;
    const a = m.equipe_a || m.home || m.home_team_label;
    const b = m.equipe_b || m.away || m.away_team_label;
    if (!a || !b) return;
    if (teamsFilter && (!teamsFilter.has(a) || !teamsFilter.has(b))) return;
    const ga = Number(m.placar_a ?? m.home_score ?? 0);
    const gb = Number(m.placar_b ?? m.away_score ?? 0);
    applyMatch(stats, a, b, ga, gb);
  });
  return Object.values(stats);
}

function applyHeadToHead(standings, matches) {
  const result = [...standings];
  let i = 0;
  while (i < result.length) {
    let j = i + 1;
    while (j < result.length && baseSort(result[i], result[j]) === 0) j += 1;
    if (j - i > 1) {
      const tied = result.slice(i, j);
      const teamSet = new Set(tied.map(t => t.team));
      const h2h = buildStatsFromMatches(matches, teamSet).sort(baseSort);
      const byTeam = new Map(h2h.map(t => [t.team, t]));
      tied.sort((a, b) => {
        const ha = byTeam.get(a.team);
        const hb = byTeam.get(b.team);
        if (ha && hb) {
          const cmp = baseSort(ha, hb);
          if (cmp !== 0) return cmp;
        }
        return Math.random() - 0.5;
      });
      result.splice(i, tied.length, ...tied);
    }
    i = j;
  }
  return result;
}

export function computeStandingsFromMatches(matches) {
  const stats = buildStatsFromMatches(matches);
  const sorted = stats.sort(baseSort);
  return applyHeadToHead(sorted, matches);
}
