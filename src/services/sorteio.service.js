import crypto from 'crypto';
import { pool, dbQuery } from '../db/conn.js';

const cacheCols = new Map();
const cacheEnums = new Map();

const MOD = { GOALS: 'GOALS', BASKET: 'BASKET', VOLLEY: 'VOLLEY' };
const STATUS_PENDING = ['NAO_INICIADO', 'SCHEDULED', 'AGENDADO', 'agendado', 'PENDENTE', 'OPEN'];
const STATUS_RUNNING = ['EM_ANDAMENTO', 'LIVE', 'IN_PROGRESS', 'em_andamento'];
const STATUS_DONE = ['FINALIZADO', 'DONE', 'ENCERRADO', 'finalizado', 'WO'];

const n = (v, d = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};
const i = (v, d = 0) => Math.trunc(n(v, d));
const txt = (v) => String(v || '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
const key = (v) => txt(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const avg = (a, b) => (n(b) === 0 ? (n(a) > 0 ? 999 : 0) : n(a) / n(b));
const clock = (v, fb = '07:30') => {
  const m = String(v || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fb;
  const hh = String(Math.max(0, Math.min(23, i(m[1])))).padStart(2, '0');
  const mm = String(Math.max(0, Math.min(59, i(m[2])))).padStart(2, '0');
  return `${hh}:${mm}`;
};

const sexoNorm = (v) => {
  const s = key(v);
  if (!s) return '';
  if (s === 'M' || s.startsWith('MASC')) return 'M';
  if (s === 'F' || s.startsWith('FEM')) return 'F';
  if (s === 'X' || s.startsWith('MIX')) return 'X';
  return s.slice(0, 1);
};

async function cols(table) {
  const t = String(table || '').toLowerCase();
  if (cacheCols.has(t)) return cacheCols.get(t);
  const rows = await dbQuery(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
    { table }
  );
  const set = new Set(rows.map((r) => r.COLUMN_NAME));
  cacheCols.set(t, set);
  return set;
}

async function enums(table, column) {
  const k = `${table}.${column}`.toLowerCase();
  if (cacheEnums.has(k)) return cacheEnums.get(k);
  const rows = await dbQuery(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column LIMIT 1`,
    { table, column }
  );
  const raw = String(rows[0]?.COLUMN_TYPE || '');
  const m = raw.match(/enum\((.*)\)/i);
  const list = m ? m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
  cacheEnums.set(k, list);
  return list;
}

function pick(list, candidates, fb = null) {
  for (const c of candidates) if (list.includes(c)) return c;
  return list[0] || fb;
}

async function statusMap() {
  const list = await enums('jogos', 'status');
  return {
    pending: pick(list, STATUS_PENDING, 'NAO_INICIADO'),
    running: pick(list, STATUS_RUNNING, 'EM_ANDAMENTO'),
    done: pick(list, STATUS_DONE, 'FINALIZADO'),
  };
}

function statusNorm(v) {
  const s = key(v);
  if (['FINALIZADO', 'DONE', 'ENCERRADO', 'WO'].includes(s)) return 'DONE';
  if (['EM_ANDAMENTO', 'LIVE', 'IN_PROGRESS'].includes(s)) return 'LIVE';
  return 'PENDING';
}

function stableDraw(v, seed = '') {
  const h = crypto.createHash('sha1').update(`${seed}:${key(v)}`).digest('hex').slice(0, 8);
  return Number.parseInt(h, 16) || 0;
}

function family(name) {
  const s = key(name);
  if (s.includes('BASQUET')) return MOD.BASKET;
  if (s.includes('VOLEI') || s.includes('VOLEIBOL') || s.includes('AREIA')) return MOD.VOLLEY;
  return MOD.GOALS;
}

function profile(name, rules = {}) {
  const f = family(name);
  if (f === MOD.BASKET) {
    return {
      family: f,
      name: txt(name || 'Basquete'),
      scoring: {
        win: n(rules?.pontuacao?.basquete?.vitoria ?? rules?.basquete_vitoria ?? 2, 2),
        loss: n(rules?.pontuacao?.basquete?.derrota ?? rules?.basquete_derrota ?? 1, 1),
      },
    };
  }
  if (f === MOD.VOLLEY) {
    return {
      family: f,
      name: txt(name || 'Volei'),
      scoring: { w3: 3, w2: 2, l1: 1, l0: 0 },
    };
  }
  return {
    family: f,
    name: txt(name || 'Coletiva'),
    scoring: { win: 3, draw: 1, loss: 0 },
  };
}

async function modalidadeName(modalidade_id) {
  const c = await cols('modalidades');
  const fields = ['id', 'titulo', 'nome', 'categoria'].filter((f) => c.has(f));
  if (!fields.includes('id')) return `Modalidade ${modalidade_id}`;
  const rows = await dbQuery(`SELECT ${fields.join(',')} FROM modalidades WHERE id = :id LIMIT 1`, { id: modalidade_id });
  const r = rows[0] || {};
  return r.titulo || r.nome || r.categoria || `Modalidade ${modalidade_id}`;
}

export async function getModalityProfileById(modalidade_id, rules = null) {
  return profile(await modalidadeName(modalidade_id), rules || {});
}

export async function getJogosColumns() {
  return cols('jogos');
}

function uniqTeams(items) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    const label = txt(it?.label || it?.team || it?.team_label || it?.turma || it);
    if (!label) continue;
    const k = key(label);
    if (!k || seen.has(k) || k === 'BYE') continue;
    seen.add(k);
    out.push({ label, key: k });
  }
  return out;
}

function shuffle(arr) {
  const a = [...arr];
  for (let x = a.length - 1; x > 0; x -= 1) {
    const y = Math.floor(Math.random() * (x + 1));
    [a[x], a[y]] = [a[y], a[x]];
  }
  return a;
}

function sizes(total) {
  const nTeams = i(total, 0);
  if (nTeams <= 1) return [];
  if (nTeams <= 5) return [nTeams];
  if (nTeams === 6) return [3, 3];
  if (nTeams === 7) return [3, 4];
  if (nTeams === 8) return [4, 4];
  if (nTeams === 9) return [3, 3, 3];
  const base = Math.floor(nTeams / 3);
  const rem = nTeams % 3;
  if (rem === 0) return Array.from({ length: base }, () => 3);
  if (rem === 1 && base >= 1) return [...Array.from({ length: base - 1 }, () => 3), 4];
  if (rem === 2 && base >= 2) return [...Array.from({ length: base - 2 }, () => 3), 4, 4];
  return [nTeams];
}

function formatByCount(total) {
  const nTeams = i(total, 0);
  if (nTeams <= 1) return { code: 'INVALID', model: 'NONE', description: 'Insuficiente', groupSizes: [] };
  if (nTeams === 2) return { code: 'BEST_OF_3', model: 'BEST_OF_3', description: 'Melhor de 3', groupSizes: [2] };
  if (nTeams >= 3 && nTeams <= 5) return { code: 'ROUND_ROBIN_SINGLE', model: 'GROUPS', description: 'Rodizio simples', groupSizes: [nTeams] };
  return { code: 'GROUPS_DYNAMIC', model: 'GROUPS', description: 'Chaves automaticas', groupSizes: sizes(nTeams) };
}

function groupLabels(count) {
  return Array.from({ length: count }, (_, idx) => `CH ${String.fromCharCode(65 + idx)}`);
}

function distribute(teams, groupSizes, heads = []) {
  const groups = groupSizes.map((size, idx) => ({ chave: groupLabels(groupSizes.length)[idx], size, teams: [] }));
  const pool = shuffle(uniqTeams(teams));
  const wanted = (Array.isArray(heads) ? heads : []).map((h) => key(h?.label || h)).filter(Boolean);

  groups.forEach((g, idx) => {
    const k = wanted[idx];
    if (!k) return;
    const pos = pool.findIndex((t) => t.key === k);
    if (pos >= 0 && g.teams.length < g.size) g.teams.push(pool.splice(pos, 1)[0]);
  });

  for (const t of pool) {
    const g = groups.find((x) => x.teams.length < x.size);
    if (!g) break;
    g.teams.push(t);
  }
  return groups;
}

function rrGroup(group) {
  const teams = uniqTeams(group?.teams || []);
  const out = [];
  for (let a = 0; a < teams.length; a += 1) {
    for (let b = a + 1; b < teams.length; b += 1) {
      if (teams[a].key === teams[b].key) continue;
      out.push({ fase: 'GRUPOS', chave: group.chave, equipeA: teams[a].label, equipeB: teams[b].label });
    }
  }
  return out;
}

function bestOf3(teams) {
  const t = uniqTeams(teams);
  if (t.length < 2) return [];
  return [1, 2, 3].map((k) => ({ fase: 'FINAL', chave: 'CH UNICA', equipeA: t[0].label, equipeB: t[1].label, jogo_label: `Final ${k}/3` }));
}

export function gerarRoundRobinTurmas(turmas, options = {}) {
  const teams = uniqTeams(turmas);
  const fmt = formatByCount(teams.length);
  if (fmt.code === 'INVALID') return { jogos: [], chaves_qtd: 0, formato: fmt, chaves: [] };
  if (fmt.model === 'BEST_OF_3') {
    return {
      jogos: bestOf3(teams),
      chaves_qtd: 1,
      formato: fmt,
      chaves: [{ chave: 'CH UNICA', equipes: teams.map((x) => x.label) }],
    };
  }
  const gs = distribute(teams, fmt.groupSizes, options?.headTeams || []);
  return {
    jogos: gs.flatMap((g) => rrGroup(g)),
    chaves_qtd: gs.length,
    formato: fmt,
    chaves: gs.map((g) => ({ chave: g.chave, equipes: g.teams.map((t) => t.label) })),
  };
}

export function aplicarHorarios(jogos, horaInicio = '07:30', intervaloMin = 10, options = {}) {
  const sequential = key(options?.strategy) === 'SEQUENCIAL';
  const start = i(options?.startNumber, 1);
  const h0 = clock(horaInicio, '07:30');
  const rows = (Array.isArray(jogos) ? jogos : []).map((r, idx) => ({
    ...r,
    ordem: i(r?.ordem, start + idx),
    numero_jogo: i(r?.numero_jogo, start + idx),
    jogo_label: txt(r?.jogo_label || r?.jogo || `Jogo ${start + idx}`),
  }));
  if (!sequential) {
    return rows.map((r, idx) => ({ ...r, hora_oficial: idx === 0 ? h0 : null, hora_texto: idx === 0 ? h0 : 'A seguir' }));
  }
  const [hh0, mm0] = h0.split(':').map((x) => i(x));
  let m = hh0 * 60 + mm0;
  const step = Math.max(0, i(intervaloMin, 0));
  return rows.map((r) => {
    const hh = String(Math.floor(m / 60) % 24).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    m += step;
    return { ...r, hora_oficial: `${hh}:${mm}`, hora_texto: `${hh}:${mm}` };
  });
}

function woDefault(p, winner = 'A') {
  const w = key(winner) === 'B' ? 'B' : 'A';
  if (p.family === MOD.VOLLEY) return w === 'A' ? { a: 2, b: 0 } : { a: 0, b: 2 };
  return w === 'A' ? { a: 1, b: 0 } : { a: 0, b: 1 };
}

export function pontuacaoPartida(p, a0, b0, opt = {}) {
  let a = i(a0, 0);
  let b = i(b0, 0);
  if (opt?.wo && a === b) {
    const d = woDefault(p, opt?.winnerSide || 'A');
    a = d.a;
    b = d.b;
  }

  if (p.family === MOD.BASKET) {
    if (a > b) return { placarA: a, placarB: b, pontosA: p.scoring.win, pontosB: p.scoring.loss, vA: 1, vB: 0, eA: 0, eB: 0, dA: 0, dB: 1 };
    if (b > a) return { placarA: a, placarB: b, pontosA: p.scoring.loss, pontosB: p.scoring.win, vA: 0, vB: 1, eA: 0, eB: 0, dA: 1, dB: 0 };
    return { placarA: a, placarB: b, pontosA: p.scoring.loss, pontosB: p.scoring.loss, vA: 0, vB: 0, eA: 1, eB: 1, dA: 0, dB: 0 };
  }

  if (p.family === MOD.VOLLEY) {
    if (a > b) {
      const diff = a - b;
      return { placarA: a, placarB: b, pontosA: diff === 1 ? p.scoring.w2 : p.scoring.w3, pontosB: diff === 1 ? p.scoring.l1 : p.scoring.l0, vA: 1, vB: 0, eA: 0, eB: 0, dA: 0, dB: 1 };
    }
    if (b > a) {
      const diff = b - a;
      return { placarA: a, placarB: b, pontosA: diff === 1 ? p.scoring.l1 : p.scoring.l0, pontosB: diff === 1 ? p.scoring.w2 : p.scoring.w3, vA: 0, vB: 1, eA: 0, eB: 0, dA: 1, dB: 0 };
    }
    return { placarA: a, placarB: b, pontosA: 1, pontosB: 1, vA: 0, vB: 0, eA: 1, eB: 1, dA: 0, dB: 0 };
  }

  if (a > b) return { placarA: a, placarB: b, pontosA: p.scoring.win, pontosB: p.scoring.loss, vA: 1, vB: 0, eA: 0, eB: 0, dA: 0, dB: 1 };
  if (b > a) return { placarA: a, placarB: b, pontosA: p.scoring.loss, pontosB: p.scoring.win, vA: 0, vB: 1, eA: 0, eB: 0, dA: 1, dB: 0 };
  return { placarA: a, placarB: b, pontosA: p.scoring.draw, pontosB: p.scoring.draw, vA: 0, vB: 0, eA: 1, eB: 1, dA: 0, dB: 0 };
}

function cards(row, side) {
  const raw = row?.cartoes_json ?? row?.cartoes;
  if (!raw) return { y: 0, r: 0 };
  let arr = [];
  try { arr = Array.isArray(raw) ? raw : JSON.parse(raw); } catch { arr = []; }
  let y = 0; let r = 0;
  for (const c of arr) {
    const t = key(c?.type || c?.cartao);
    const s = key(c?.team || c?.equipe || c?.lado);
    const ok = s === key(side) || (side === 'A' && s === 'HOME') || (side === 'B' && s === 'AWAY');
    if (!ok) continue;
    if (t === 'RED' || t === 'VERMELHO') r += 1;
    if (t === 'YELLOW' || t === 'AMARELO') y += 1;
  }
  return { y, r };
}

function baseStats(team, chave = '') {
  return {
    equipe: team, team: team, k: key(team), chave,
    pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0,
    pro: 0, contra: 0, saldo: 0, cartoes_amarelos: 0, cartoes_vermelhos: 0,
    sets_pro: 0, sets_contra: 0, posicao: 0,
  };
}

function miniMap(keys, matches, p) {
  const set = new Set(keys);
  const map = new Map();
  const up = (team) => {
    const k = key(team);
    if (!k || !set.has(k)) return null;
    if (!map.has(k)) map.set(k, { pontos: 0, vitorias: 0, pro: 0, contra: 0, saldo: 0, sets_pro: 0, sets_contra: 0 });
    return map.get(k);
  };
  for (const row of matches) {
    if (statusNorm(row?.status) !== 'DONE') continue;
    const aTeam = txt(row?.equipeA || row?.equipe_a);
    const bTeam = txt(row?.equipeB || row?.equipe_b);
    const ka = key(aTeam); const kb = key(bTeam);
    if (!set.has(ka) || !set.has(kb)) continue;
    const A = up(aTeam); const B = up(bTeam);
    if (!A || !B) continue;
    const s = pontuacaoPartida(p, row?.placar_a, row?.placar_b, { wo: Boolean(row?.wo) });
    A.pontos += s.pontosA; B.pontos += s.pontosB;
    A.vitorias += s.vA; B.vitorias += s.vB;
    A.pro += s.placarA; A.contra += s.placarB; B.pro += s.placarB; B.contra += s.placarA;
    A.saldo = A.pro - A.contra; B.saldo = B.pro - B.contra;
    if (p.family === MOD.VOLLEY) {
      A.sets_pro += s.placarA; A.sets_contra += s.placarB;
      B.sets_pro += s.placarB; B.sets_contra += s.placarA;
    }
  }
  return map;
}

function tieSort(cluster, matches, p, seed = '') {
  const mm = miniMap(cluster.map((x) => x.k), matches, p);
  const direct = (a, b) => {
    const m2 = miniMap([a.k, b.k], matches, p);
    const A = m2.get(a.k); const B = m2.get(b.k);
    if (!A || !B) return 0;
    if (B.pontos !== A.pontos) return B.pontos - A.pontos;
    if (B.vitorias !== A.vitorias) return B.vitorias - A.vitorias;
    if (B.saldo !== A.saldo) return B.saldo - A.saldo;
    if (B.pro !== A.pro) return B.pro - A.pro;
    return 0;
  };

  return [...cluster].sort((a, b) => {
    if (cluster.length === 2) {
      const d = direct(a, b);
      if (d !== 0) return d;
    }
    if (p.family === MOD.BASKET) {
      const A = mm.get(a.k) || {}; const B = mm.get(b.k) || {};
      if ((B.saldo || 0) !== (A.saldo || 0)) return (B.saldo || 0) - (A.saldo || 0);
      if (b.saldo !== a.saldo) return b.saldo - a.saldo;
      const avA = avg(a.pro, a.contra); const avB = avg(b.pro, b.contra);
      if (avB !== avA) return avB - avA;
      return stableDraw(a.equipe, `${seed}:B`) - stableDraw(b.equipe, `${seed}:B`);
    }
    if (p.family === MOD.VOLLEY) {
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      const sa = avg(a.sets_pro, a.sets_contra); const sb = avg(b.sets_pro, b.sets_contra);
      if (sb !== sa) return sb - sa;
      const pa = avg(a.pro, a.contra); const pb = avg(b.pro, b.contra);
      if (pb !== pa) return pb - pa;
      return stableDraw(a.equipe, `${seed}:V`) - stableDraw(b.equipe, `${seed}:V`);
    }
    if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
    if (a.cartoes_vermelhos !== b.cartoes_vermelhos) return a.cartoes_vermelhos - b.cartoes_vermelhos;
    if (a.cartoes_amarelos !== b.cartoes_amarelos) return a.cartoes_amarelos - b.cartoes_amarelos;
    if (b.saldo !== a.saldo) return b.saldo - a.saldo;
    if (b.pro !== a.pro) return b.pro - a.pro;
    return stableDraw(a.equipe, `${seed}:G`) - stableDraw(b.equipe, `${seed}:G`);
  });
}

function statsGroup(matches, p, chave) {
  const map = new Map();
  for (const row of matches) {
    const a = txt(row?.equipeA || row?.equipe_a);
    const b = txt(row?.equipeB || row?.equipe_b);
    if (!a || !b) continue;
    if (!map.has(key(a))) map.set(key(a), baseStats(a, chave));
    if (!map.has(key(b))) map.set(key(b), baseStats(b, chave));
  }
  for (const row of matches) {
    if (statusNorm(row?.status) !== 'DONE') continue;
    const a = txt(row?.equipeA || row?.equipe_a);
    const b = txt(row?.equipeB || row?.equipe_b);
    if (!a || !b) continue;
    const A = map.get(key(a)); const B = map.get(key(b));
    if (!A || !B) continue;
    const s = pontuacaoPartida(p, row?.placar_a, row?.placar_b, { wo: Boolean(row?.wo) });
    A.jogos += 1; B.jogos += 1;
    A.pontos += s.pontosA; B.pontos += s.pontosB;
    A.vitorias += s.vA; B.vitorias += s.vB;
    A.empates += s.eA; B.empates += s.eB;
    A.derrotas += s.dA; B.derrotas += s.dB;
    A.pro += s.placarA; A.contra += s.placarB;
    B.pro += s.placarB; B.contra += s.placarA;
    A.saldo = A.pro - A.contra; B.saldo = B.pro - B.contra;
    if (p.family === MOD.VOLLEY) {
      A.sets_pro += s.placarA; A.sets_contra += s.placarB;
      B.sets_pro += s.placarB; B.sets_contra += s.placarA;
    }
    const ca = cards(row, 'A'); const cb = cards(row, 'B');
    A.cartoes_amarelos += ca.y; A.cartoes_vermelhos += ca.r;
    B.cartoes_amarelos += cb.y; B.cartoes_vermelhos += cb.r;
  }

  const arr = [...map.values()].sort((a, b) => b.pontos - a.pontos);
  const out = [];
  let x = 0;
  while (x < arr.length) {
    let y = x + 1;
    while (y < arr.length && arr[y].pontos === arr[x].pontos) y += 1;
    const cl = arr.slice(x, y);
    out.push(...(cl.length > 1 ? tieSort(cl, matches, p, `${chave}:${x}`) : cl));
    x = y;
  }
  out.forEach((r, idx) => {
    r.posicao = idx + 1;
    r.sets_average = avg(r.sets_pro, r.sets_contra);
    r.pontos_average = avg(r.pro, r.contra);
    r.cesta_average = avg(r.pro, r.contra);
    r.indice_tecnico = r.pontos * 1000 + r.saldo * 100 + r.pro;
  });
  return out;
}

export function calcularRankingPorChave(jogos, profileInput, options = {}) {
  const p = profileInput?.family ? profileInput : profile(profileInput?.name || profileInput || '');
  const grouped = new Map();
  for (const row of Array.isArray(jogos) ? jogos : []) {
    const c = txt(row?.chave || row?.grupo || 'CH A') || 'CH A';
    if (!grouped.has(c)) grouped.set(c, []);
    grouped.get(c).push(row);
  }
  const out = {};
  for (const [c, rows] of grouped.entries()) out[c] = statsGroup(rows, p, c);
  if (!Object.keys(out).length && options?.includeEmpty && options?.defaultKey) out[options.defaultKey] = [];
  return out;
}

export function calcularRanking(jogosFinalizados, profileInput = null, options = {}) {
  return calcularRankingPorChave(jogosFinalizados, profileInput, options);
}

function whereNamed(c, ctx, alias = '') {
  const p = alias ? `${alias}.` : '';
  const w = []; const params = {};
  if (c.has('organization_id') && ctx?.organization_id != null) { w.push(`${p}organization_id = :organization_id`); params.organization_id = ctx.organization_id; }
  if (c.has('evento_id') && ctx?.evento_id != null) { w.push(`${p}evento_id = :evento_id`); params.evento_id = ctx.evento_id; }
  if (c.has('modalidade_id') && ctx?.modalidade_id != null) { w.push(`${p}modalidade_id = :modalidade_id`); params.modalidade_id = ctx.modalidade_id; }
  if (c.has('sexo') && ctx?.sexo) { w.push(`${p}sexo = :sexo`); params.sexo = sexoNorm(ctx.sexo); }
  return { w, params };
}

function wherePos(c, ctx, alias = '') {
  const p = alias ? `${alias}.` : '';
  const w = []; const vals = [];
  if (c.has('organization_id') && ctx?.organization_id != null) { w.push(`${p}organization_id = ?`); vals.push(ctx.organization_id); }
  if (c.has('evento_id') && ctx?.evento_id != null) { w.push(`${p}evento_id = ?`); vals.push(ctx.evento_id); }
  if (c.has('modalidade_id') && ctx?.modalidade_id != null) { w.push(`${p}modalidade_id = ?`); vals.push(ctx.modalidade_id); }
  if (c.has('sexo') && ctx?.sexo) { w.push(`${p}sexo = ?`); vals.push(sexoNorm(ctx.sexo)); }
  return { w, vals };
}

async function rowsContext(ctx) {
  const c = await cols('jogos');
  const { w, params } = whereNamed(c, ctx);
  const ord = [c.has('ordem') ? 'ordem ASC' : null, c.has('numero_jogo') ? 'numero_jogo ASC' : null, 'id ASC'].filter(Boolean).join(', ');
  return dbQuery(`SELECT * FROM jogos ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY ${ord}`, params);
}

function isGroup(row) {
  const f = key(row?.fase || 'GRUPOS');
  return !f || f === 'GRUPOS' || f === 'GROUP';
}

function rulesMeta(meta) {
  try {
    const raw = meta?.rules_json ?? meta?.regras_json;
    if (!raw) return {};
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

export async function buscarSorteio(ctx) {
  const jogos = await rowsContext(ctx);
  const mc = await cols('sorteio_meta');
  const { w, params } = whereNamed(mc, ctx);
  const metaRows = await dbQuery(`SELECT * FROM sorteio_meta ${w.length ? `WHERE ${w.join(' AND ')}` : ''} LIMIT 1`, params);
  const meta = metaRows[0] || null;
  const p = await getModalityProfileById(ctx.modalidade_id, rulesMeta(meta));
  const groups = jogos.filter(isGroup);
  const ranking = calcularRankingPorChave(groups, p);
  const resumo = Object.entries(ranking).map(([chave, r]) => ({
    chave,
    equipes: r.map((x) => x.equipe),
    jogos: groups.filter((g) => txt(g?.chave || 'CH A') === chave).length,
    finalizados: groups.filter((g) => txt(g?.chave || 'CH A') === chave && statusNorm(g?.status) === 'DONE').length,
  })).sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR', { sensitivity: 'base' }));
  return { jogos, meta, profile: p, ranking_por_chave: ranking, resumo_chaves: resumo };
}

async function insertRows(conn, jc, sm, ctx, rows, startOrd = 1, startNum = 1) {
  const out = [];
  for (let idx = 0; idx < rows.length; idx += 1) {
    const r = rows[idx];
    const ord = i(r?.ordem, startOrd + idx);
    const num = i(r?.numero_jogo, startNum + idx);
    const fields = [];
    const vals = [];
    const push = (f, v) => {
      if (!jc.has(f) || v === undefined) return;
      fields.push(f); vals.push(v);
    };

    push('organization_id', ctx.organization_id);
    push('evento_id', ctx.evento_id);
    push('modalidade_id', ctx.modalidade_id);
    push('sexo', sexoNorm(ctx.sexo));
    push('fase', txt(r?.fase || 'GRUPOS') || 'GRUPOS');
    push('chave', txt(r?.chave || 'CH A') || 'CH A');
    push('ordem', ord);
    push('numero_jogo', num);
    push('jogo_label', txt(r?.jogo_label || r?.jogo || `Jogo ${num}`));
    push('hora_oficial', r?.hora_oficial ? clock(r.hora_oficial) : null);
    push('hora_texto', txt(r?.hora_texto || r?.hora || '') || null);
    push('local', txt(r?.local || r?.local_jogos || '') || null);
    push('equipe_a', txt(r?.equipeA || r?.equipe_a || 'A definir') || 'A definir');
    push('equipe_b', txt(r?.equipeB || r?.equipe_b || 'A definir') || 'A definir');
    push('placar_a', r?.placar_a == null ? null : i(r?.placar_a, 0));
    push('placar_b', r?.placar_b == null ? null : i(r?.placar_b, 0));
    push('pontos_a', r?.pontos_a == null ? null : n(r?.pontos_a, 0));
    push('pontos_b', r?.pontos_b == null ? null : n(r?.pontos_b, 0));
    push('status', statusNorm(r?.status) === 'DONE' ? sm.done : statusNorm(r?.status) === 'LIVE' ? sm.running : sm.pending);
    push('wo', r?.wo ? 1 : 0);
    push('observacoes', txt(r?.observacoes || '') || null);
    push('stage_id', r?.stage_id ?? null);
    push('group_id', r?.group_id ?? null);
    push('home_team_id', r?.home_team_id ?? null);
    push('away_team_id', r?.away_team_id ?? null);
    push('next_jogo_id', r?.next_jogo_id ?? null);
    push('next_match_id', r?.next_match_id ?? null);
    push('next_slot', r?.next_slot ?? null);

    if (!fields.length) continue;
    const [res] = await conn.query(`INSERT INTO jogos (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, vals);
    out.push({ ...r, id: res.insertId, ordem: ord, numero_jogo: num });
  }
  return out;
}

async function replaceMeta(conn, mc, ctx, payload) {
  const fields = [];
  const values = [];
  const push = (f, v) => {
    if (!mc.has(f) || v === undefined) return;
    fields.push(f); values.push(v);
  };
  push('organization_id', ctx.organization_id);
  push('evento_id', ctx.evento_id);
  push('modalidade_id', ctx.modalidade_id);
  push('sexo', sexoNorm(ctx.sexo));
  push('modo', payload?.modo || 'GRUPOS');
  push('local_jogos', payload?.local_jogos || 'Quadra A');
  push('hora_inicio', clock(payload?.hora_inicio || '07:30'));
  push('intervalo_min', i(payload?.intervalo_min, 10));
  push('chaves_qtd', i(payload?.chaves_qtd, 1));
  push('sistema_disputa', payload?.sistema_disputa || null);
  push('tipo_participacao', payload?.tipo_participacao || null);
  if (mc.has('rules_json')) { fields.push('rules_json'); values.push(payload?.rules_json ? JSON.stringify(payload.rules_json) : null); }
  if (mc.has('formato')) push('formato', payload?.formato || null);
  if (!fields.length) return;

  // Compatibilidade com esquemas legados:
  // algumas bases possuem chave unica antiga (modalidade_id, sexo),
  // outras ja usam (organization_id, evento_id, modalidade_id, sexo).
  // UPSERT evita erro ER_DUP_ENTRY em ambos os cenarios.
  const updatable = fields.filter((f) => f !== 'id');
  if (!updatable.length) {
    await conn.query(
      `INSERT INTO sorteio_meta (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      values
    );
    return;
  }

  const updateSql = updatable.map((f) => `${f} = VALUES(${f})`).join(', ');
  await conn.query(
    `INSERT INTO sorteio_meta (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${updateSql}`,
    values
  );
}

async function persist(ctx, payload) {
  const jc = await cols('jogos');
  const mc = await cols('sorteio_meta');
  const sm = await statusMap();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { w, vals } = wherePos(jc, ctx);
    await conn.query(`DELETE FROM jogos ${w.length ? `WHERE ${w.join(' AND ')}` : ''}`, vals);
    await insertRows(conn, jc, sm, ctx, payload.jogos || [], 1, 1);
    await replaceMeta(conn, mc, ctx, payload);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function buscarTurmasInscritas({ modalidade_id, sexo, tipo_participacao = 'COLETIVA' }) {
  const tipo = key(tipo_participacao);
  const ac = await cols('alunos');
  const hasSexo = ac.has('sexo');
  const sx = sexoNorm(sexo) || null;

  if (tipo === 'INDIVIDUAL' || tipo === 'IND') {
    const rows = await dbQuery(
      `SELECT DISTINCT TRIM(a.nome) AS participante
         FROM inscricoes i JOIN alunos a ON a.id = i.aluno_id
        WHERE i.modalidade_id = :modalidade_id
          ${hasSexo ? 'AND (:sexo IS NULL OR a.sexo = :sexo)' : ''}
          AND a.nome IS NOT NULL AND TRIM(a.nome) <> ''
        ORDER BY TRIM(a.nome) ASC`,
      { modalidade_id, sexo: sx }
    );
    return uniqTeams(rows.map((r) => r.participante)).map((x) => x.label);
  }

  const rows = await dbQuery(
    `SELECT TRIM(a.turma) AS turma, COUNT(DISTINCT a.id) AS atletas
       FROM inscricoes i JOIN alunos a ON a.id = i.aluno_id
      WHERE i.modalidade_id = :modalidade_id
        ${hasSexo ? 'AND (:sexo IS NULL OR a.sexo = :sexo)' : ''}
        AND a.turma IS NOT NULL AND TRIM(a.turma) <> ''
      GROUP BY TRIM(a.turma)
      ORDER BY TRIM(a.turma) ASC`,
    { modalidade_id, sexo: sx }
  );

  const wantDupla = tipo === 'DUPLA' || tipo === 'DOUBLE' || tipo === 'PAIR';
  return uniqTeams(rows.filter((r) => (wantDupla ? i(r.atletas, 0) === 2 : i(r.atletas, 0) >= 1)).map((r) => r.turma)).map((x) => x.label);
}

export async function salvarSorteio({
  organization_id, evento_id, modalidade_id, sexo, modo, local_jogos, hora_inicio, intervalo_min, chaves_qtd, jogos, tipo_participacao, rules_json,
}) {
  const ctx = { organization_id, evento_id, modalidade_id, sexo: sexoNorm(sexo) };
  const p = await getModalityProfileById(modalidade_id, rules_json || {});
  const normalized = (Array.isArray(jogos) ? jogos : []).map((r, idx) => {
    const row = { ...r, ordem: i(r?.ordem, idx + 1), numero_jogo: i(r?.numero_jogo ?? r?.jogo, idx + 1) };
    if (row.placar_a != null && row.placar_b != null && (row.pontos_a == null || row.pontos_b == null)) {
      const s = pontuacaoPartida(p, row.placar_a, row.placar_b, { wo: Boolean(row.wo) });
      row.pontos_a = row.pontos_a == null ? s.pontosA : row.pontos_a;
      row.pontos_b = row.pontos_b == null ? s.pontosB : row.pontos_b;
    }
    return row;
  });
  const timed = aplicarHorarios(normalized, hora_inicio || '07:30', intervalo_min || 10, { strategy: 'BOLETIM', startNumber: 1 });
  await persist(ctx, {
    jogos: timed,
    modo: modo || 'GRUPOS',
    local_jogos: local_jogos || 'Quadra A',
    hora_inicio: hora_inicio || '07:30',
    intervalo_min: i(intervalo_min, 10),
    chaves_qtd: i(chaves_qtd, 0) || new Set(timed.map((r) => txt(r?.chave || 'CH A'))).size || 1,
    sistema_disputa: 'CONFIGURADO',
    formato: 'MANUAL',
    tipo_participacao: tipo_participacao || 'COLETIVA',
    rules_json: rules_json || null,
  });
  return buscarSorteio(ctx);
}

export async function gerarSorteioOficial({
  organization_id, evento_id, modalidade_id, sexo, local_jogos = 'Quadra A', modo = 'GRUPOS', hora_inicio = '07:30', intervalo_min = 10, tipo_participacao = 'COLETIVA', head_teams = [], rules_json = null,
}) {
  const ctx = { organization_id, evento_id, modalidade_id, sexo: sexoNorm(sexo) };
  const teams = uniqTeams(await buscarTurmasInscritas({ modalidade_id, sexo: ctx.sexo, tipo_participacao }));
  if (teams.length < 2) throw new Error('Numero insuficiente de equipes para sorteio.');

  const fmt = formatByCount(teams.length);
  let jogosBase = [];
  let chaves = [];
  if (fmt.model === 'BEST_OF_3') {
    jogosBase = bestOf3(teams);
    chaves = [{ chave: 'CH UNICA', equipes: teams.map((t) => t.label) }];
  } else {
    const gs = distribute(teams, fmt.groupSizes, head_teams || []);
    jogosBase = gs.flatMap((g) => rrGroup(g));
    chaves = gs.map((g) => ({ chave: g.chave, equipes: g.teams.map((t) => t.label) }));
  }

  const jogos = aplicarHorarios(jogosBase, hora_inicio, intervalo_min, { strategy: 'BOLETIM', startNumber: 1 }).map((r) => ({
    ...r, local: txt(local_jogos || 'Quadra A'), status: 'NAO_INICIADO', pontos_a: null, pontos_b: null, wo: false,
  }));

  await persist(ctx, {
    jogos,
    modo,
    local_jogos,
    hora_inicio,
    intervalo_min,
    chaves_qtd: chaves.length || 1,
    sistema_disputa: fmt.description,
    formato: fmt.code,
    tipo_participacao,
    rules_json: rules_json || null,
  });

  const loaded = await buscarSorteio(ctx);
  return { ...loaded, formato: fmt, chaves_qtd: chaves.length || 1, chaves, total_equipes: teams.length };
}

export async function aplicarHorariosEmJogos({ organization_id, evento_id, modalidade_id, sexo, hora_inicio = '07:30', intervalo_min = 10 }) {
  const ctx = { organization_id, evento_id, modalidade_id, sexo: sexoNorm(sexo) };
  const jc = await cols('jogos');
  const rows = await rowsContext(ctx);
  if (!rows.length) return;
  const timed = aplicarHorarios(rows.map((r, idx) => ({ ...r, ordem: i(r?.ordem, idx + 1), numero_jogo: i(r?.numero_jogo, idx + 1) })), hora_inicio, intervalo_min, { strategy: 'BOLETIM', startNumber: 1 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const r of timed) {
      const set = [];
      const vals = [];
      if (jc.has('hora_oficial')) { set.push('hora_oficial = ?'); vals.push(r.hora_oficial ? clock(r.hora_oficial) : null); }
      if (jc.has('hora_texto')) { set.push('hora_texto = ?'); vals.push(txt(r.hora_texto || '') || null); }
      if (jc.has('ordem')) { set.push('ordem = ?'); vals.push(i(r.ordem, 0)); }
      if (jc.has('numero_jogo')) { set.push('numero_jogo = ?'); vals.push(i(r.numero_jogo, 0)); }
      if (!set.length) continue;
      vals.push(r.id);
      await conn.query(`UPDATE jogos SET ${set.join(', ')} WHERE id = ?`, vals);
    }

    const mc = await cols('sorteio_meta');
    const { w, vals } = wherePos(mc, ctx);
    const setM = [];
    const vM = [];
    if (mc.has('hora_inicio')) { setM.push('hora_inicio = ?'); vM.push(clock(hora_inicio)); }
    if (mc.has('intervalo_min')) { setM.push('intervalo_min = ?'); vM.push(i(intervalo_min, 10)); }
    if (setM.length && w.length) await conn.query(`UPDATE sorteio_meta SET ${setM.join(', ')} WHERE ${w.join(' AND ')}`, [...vM, ...vals]);

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

function isKnockout(row) {
  return !isGroup(row);
}

function koPhase(matchCount) {
  if (matchCount <= 1) return 'FINAL';
  if (matchCount === 2) return 'SEMI';
  if (matchCount === 4) return 'QUARTAS';
  if (matchCount === 8) return 'OITAVAS';
  return 'MATA_MATA';
}

function globalSort(cands, p, seed = '') {
  return [...cands].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (p.family === MOD.BASKET) {
      if (b.saldo !== a.saldo) return b.saldo - a.saldo;
      const avA = avg(a.pro, a.contra); const avB = avg(b.pro, b.contra);
      if (avB !== avA) return avB - avA;
    } else if (p.family === MOD.VOLLEY) {
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      const sa = avg(a.sets_pro, a.sets_contra); const sb = avg(b.sets_pro, b.sets_contra);
      if (sb !== sa) return sb - sa;
      const pa = avg(a.pro, a.contra); const pb = avg(b.pro, b.contra);
      if (pb !== pa) return pb - pa;
    } else {
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      if (a.cartoes_vermelhos !== b.cartoes_vermelhos) return a.cartoes_vermelhos - b.cartoes_vermelhos;
      if (a.cartoes_amarelos !== b.cartoes_amarelos) return a.cartoes_amarelos - b.cartoes_amarelos;
      if (b.saldo !== a.saldo) return b.saldo - a.saldo;
      if (b.pro !== a.pro) return b.pro - a.pro;
    }
    return stableDraw(a.equipe, `${seed}:g`) - stableDraw(b.equipe, `${seed}:g`);
  });
}

function qualificados(rankingByChave, p) {
  const ch = Object.keys(rankingByChave).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  if (!ch.length) return { list: [], mode: 'NONE' };

  if (ch.length === 1) {
    return { list: (rankingByChave[ch[0]] || []).slice(0, 2).map((t) => ({ ...t, origem_chave: ch[0], origem_posicao: t.posicao })), mode: 'FINAL_DIRECT' };
  }

  if (ch.length === 2) {
    const A = rankingByChave[ch[0]] || [];
    const B = rankingByChave[ch[1]] || [];
    return {
      list: [
        A[0] ? { ...A[0], origem_chave: ch[0], origem_posicao: 1 } : null,
        B[1] ? { ...B[1], origem_chave: ch[1], origem_posicao: 2 } : null,
        B[0] ? { ...B[0], origem_chave: ch[1], origem_posicao: 1 } : null,
        A[1] ? { ...A[1], origem_chave: ch[0], origem_posicao: 2 } : null,
      ].filter(Boolean),
      mode: 'CROSS_2_GROUPS',
    };
  }

  const first = ch.map((c) => (rankingByChave[c]?.[0] ? { ...rankingByChave[c][0], origem_chave: c, origem_posicao: 1 } : null)).filter(Boolean);
  let target = 4;
  if (first.length > 4 && first.length <= 8) target = 8;
  if (first.length > 8) target = 16;
  const sec = ch.map((c) => (rankingByChave[c]?.[1] ? { ...rankingByChave[c][1], origem_chave: c, origem_posicao: 2 } : null)).filter(Boolean);
  const third = ch.map((c) => (rankingByChave[c]?.[2] ? { ...rankingByChave[c][2], origem_chave: c, origem_posicao: 3 } : null)).filter(Boolean);
  const list = [...first];
  for (const t of globalSort(sec, p, '2nd')) { if (list.length >= target) break; list.push(t); }
  for (const t of globalSort(third, p, '3rd')) { if (list.length >= target) break; list.push(t); }
  return { list: globalSort(list, p, 'seed').map((x, idx) => ({ ...x, seed: idx + 1 })), mode: 'SEEDED' };
}

function pairSeeded(list) {
  const rem = [...list];
  const pairs = [];
  while (rem.length >= 2) {
    const a = rem.shift();
    let idx = rem.length - 1;
    while (idx >= 0 && rem[idx].origem_chave === a.origem_chave) idx -= 1;
    if (idx < 0) idx = rem.length - 1;
    const [b] = rem.splice(idx, 1);
    pairs.push([a, b]);
  }
  return pairs;
}

function buildKOBlueprint(firstPairs, local = 'Quadra A') {
  if (!firstPairs.length) return [];
  const rounds = [];
  let cnt = firstPairs.length;
  let r = 0;
  while (cnt >= 1) {
    const phase = koPhase(cnt);
    const arr = [];
    for (let m = 0; m < cnt; m += 1) {
      const pair = r === 0 ? firstPairs[m] : null;
      arr.push({ __temp_id: `R${r + 1}M${m + 1}`, fase: phase, chave: 'MATA', equipeA: pair?.[0]?.equipe || 'A definir', equipeB: pair?.[1]?.equipe || 'A definir', local, status: 'NAO_INICIADO', wo: false });
    }
    rounds.push(arr);
    if (cnt === 1) break;
    cnt = Math.ceil(cnt / 2);
    r += 1;
  }

  for (let x = 0; x < rounds.length - 1; x += 1) {
    for (let m = 0; m < rounds[x].length; m += 2) {
      const t = rounds[x + 1][Math.floor(m / 2)];
      if (!t) continue;
      if (rounds[x][m]) { rounds[x][m].__next_temp_id = t.__temp_id; rounds[x][m].__next_slot = 'A'; }
      if (rounds[x][m + 1]) { rounds[x][m + 1].__next_temp_id = t.__temp_id; rounds[x][m + 1].__next_slot = 'B'; }
    }
  }
  return rounds.flat();
}

export async function gerarMataMataPorCruzamento({ organization_id, evento_id, modalidade_id, sexo, force = false, local_jogos = 'Quadra A', hora_inicio = '07:30' }) {
  const ctx = { organization_id, evento_id, modalidade_id, sexo: sexoNorm(sexo) };
  const jc = await cols('jogos');
  const sm = await statusMap();
  const p = await getModalityProfileById(modalidade_id);
  const all = await rowsContext(ctx);
  if (all.some(isKnockout)) return { created: false, reason: 'KNOCKOUT_ALREADY_EXISTS', jogos: all.filter(isKnockout) };
  const groups = all.filter(isGroup);
  if (!groups.length) return { created: false, reason: 'GROUP_STAGE_EMPTY', jogos: [] };
  const pending = groups.filter((r) => statusNorm(r?.status) !== 'DONE');
  if (pending.length && !force) return { created: false, reason: 'GROUP_STAGE_NOT_FINISHED', pending: pending.length, jogos: [] };

  const rb = calcularRankingPorChave(groups, p);
  const q = qualificados(rb, p);
  if ((q.list || []).length < 2) return { created: false, reason: 'NOT_ENOUGH_QUALIFIED', jogos: [] };

  let firstPairs = [];
  if (q.mode === 'CROSS_2_GROUPS' && q.list.length >= 4) {
    firstPairs = [[q.list[0], q.list[1]], [q.list[2], q.list[3]]];
  } else {
    firstPairs = pairSeeded(q.list);
  }
  if (!firstPairs.length) return { created: false, reason: 'PAIRING_FAILED', jogos: [] };

  const blueprint = buildKOBlueprint(firstPairs, local_jogos || 'Quadra A');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const maxWhere = wherePos(jc, ctx);
    const ordExpr = jc.has('ordem') ? 'COALESCE(MAX(ordem),0)' : '0';
    const numExpr = jc.has('numero_jogo') ? 'COALESCE(MAX(numero_jogo),0)' : ordExpr;
    const [mxRows] = await conn.query(`SELECT ${ordExpr} AS mo, ${numExpr} AS mn FROM jogos ${maxWhere.w.length ? `WHERE ${maxWhere.w.join(' AND ')}` : ''}`, maxWhere.vals);
    const mo = i(mxRows[0]?.mo, 0);
    const mn = i(mxRows[0]?.mn, 0);

    const timed = aplicarHorarios(blueprint, hora_inicio, 0, { strategy: 'BOLETIM', startNumber: mn + 1 });
    const inserted = await insertRows(conn, jc, sm, ctx, timed, mo + 1, mn + 1);

    const tempMap = new Map(inserted.map((r) => [r.__temp_id, r.id]));
    const nextIdCol = jc.has('next_jogo_id') ? 'next_jogo_id' : (jc.has('next_match_id') ? 'next_match_id' : null);
    const nextSlotCol = jc.has('next_slot') ? 'next_slot' : null;

    if (nextIdCol) {
      for (const r of inserted) {
        if (!r.__next_temp_id) continue;
        const nxt = tempMap.get(r.__next_temp_id);
        if (!nxt) continue;
        const set = [`${nextIdCol} = ?`];
        const vals = [nxt];
        if (nextSlotCol) { set.push(`${nextSlotCol} = ?`); vals.push(key(r.__next_slot) === 'B' ? 'B' : 'A'); }
        vals.push(r.id);
        await conn.query(`UPDATE jogos SET ${set.join(', ')} WHERE id = ?`, vals);
      }
    }

    await conn.commit();
    const fresh = await rowsContext(ctx);
    return { created: true, reason: 'OK', jogos: fresh.filter(isKnockout), ranking_por_chave: rb, qualified: q.list };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function limparSorteio({ organization_id, evento_id, modalidade_id, sexo }) {
  const ctx = { organization_id, evento_id, modalidade_id, sexo: sexoNorm(sexo) };
  const jc = await cols('jogos');
  const mc = await cols('sorteio_meta');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const jw = wherePos(jc, ctx);
    await conn.query(`DELETE FROM jogos ${jw.w.length ? `WHERE ${jw.w.join(' AND ')}` : ''}`, jw.vals);
    const mw = wherePos(mc, ctx);
    await conn.query(`DELETE FROM sorteio_meta ${mw.w.length ? `WHERE ${mw.w.join(' AND ')}` : ''}`, mw.vals);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
