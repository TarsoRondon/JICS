import { dbQuery } from '../db/conn.js';
import { generateRoundRobinMatches } from '../utils/roundRobin.util.js';
import { shuffle } from '../utils/shuffle.util.js';
import {
  insertJogo,
  updateJogo,
  resolveStatusValues,
  getJogosColumns,
  resolveNextSlotValues,
  resolveNextColumns,
} from './jogosAdapter.service.js';

function normalizeTeamLabel(team) {
  const label = team?.label || team?.team_label || team?.team || team;
  const clean = String(label || '').replace(/\r?\n/g, ' ').trim();
  return clean || 'A definir';
}

function faseByRound(roundSize) {
  if (roundSize === 2) return 'FINAL';
  if (roundSize === 4) return 'SEMI';
  return 'OUTRA';
}

export async function createGroupMatches({
  organization_id,
  evento_id,
  modalidade_id,
  sexo,
  stage_id,
  group,
  teams,
}) {
  const statusValues = await resolveStatusValues();
  const matches = generateRoundRobinMatches(teams);
  let ordem = 1;
  for (const m of matches) {
    const homeLabel = normalizeTeamLabel(m.home);
    const awayLabel = normalizeTeamLabel(m.away);
    await insertJogo({
      organization_id,
      evento_id,
      modalidade_id,
      sexo,
      fase: 'GRUPOS',
      stage_id,
      group_id: group.id,
      chave: group.nome,
      ordem,
      equipe_a: homeLabel,
      equipe_b: awayLabel,
      numero_jogo: ordem,
      status: statusValues.scheduled,
      home_team_id: m.home.id || null,
      away_team_id: m.away.id || null,
    });
    ordem += 1;
  }
}

function pairTeams(teams) {
  const pairs = [];
  for (let i = 0; i < teams.length; i += 2) {
    pairs.push([teams[i], teams[i + 1]]);
  }
  return pairs;
}

export async function createKnockoutMatches({
  organization_id,
  evento_id,
  modalidade_id,
  sexo,
  stage_id,
  group_id,
  teams,
  shuffleOnEntry = true,
}) {
  const cols = await getJogosColumns();
  const nextCols = await resolveNextColumns();
  const nextSlots = await resolveNextSlotValues();
  const statusValues = await resolveStatusValues();
  const orderedTeams = shuffleOnEntry ? shuffle(teams) : [...teams];
  if (orderedTeams.length < 2) return [];
  if (orderedTeams.length % 2 === 1) orderedTeams.pop();

  let ordem = 1;
  const firstRound = pairTeams(orderedTeams);
  const matchIds = [];
  const round1Ids = [];
  for (const [home, away] of firstRound) {
    const id = await insertJogo({
      organization_id,
      evento_id,
      modalidade_id,
      sexo,
      fase: faseByRound(firstRound.length * 2),
      stage_id,
      group_id,
      chave: 'KO',
      ordem,
      numero_jogo: ordem,
      equipe_a: normalizeTeamLabel(home),
      equipe_b: normalizeTeamLabel(away),
      status: statusValues.scheduled,
      home_team_id: home.id || null,
      away_team_id: away.id || null,
    });
    ordem += 1;
    round1Ids.push(id);
    matchIds.push(id);
  }

  // create next rounds
  let prevRound = round1Ids;
  while (prevRound.length > 1) {
    const nextRound = [];
    const nextRoundSize = prevRound.length;
    for (let i = 0; i < prevRound.length; i += 2) {
      const id = await insertJogo({
        organization_id,
        evento_id,
        modalidade_id,
        sexo,
        fase: faseByRound(nextRoundSize),
        stage_id,
        group_id,
        chave: 'KO',
        ordem,
        numero_jogo: ordem,
        equipe_a: cols.has('equipe_a') ? 'A definir' : undefined,
        equipe_b: cols.has('equipe_b') ? 'A definir' : undefined,
        status: statusValues.scheduled,
      });
      ordem += 1;
      nextRound.push(id);
      matchIds.push(id);
    }
    // wire previous round to next
    for (let i = 0; i < prevRound.length; i += 2) {
      const nextId = nextRound[i / 2];
      const leftPayload = {};
      const rightPayload = {};
      if (nextCols.nextIdCol) {
        leftPayload[nextCols.nextIdCol] = nextId;
        rightPayload[nextCols.nextIdCol] = nextId;
      }
      if (nextCols.nextSlotCol) {
        leftPayload[nextCols.nextSlotCol] = nextSlots.home;
        rightPayload[nextCols.nextSlotCol] = nextSlots.away;
      }
      await updateJogo(prevRound[i], leftPayload);
      await updateJogo(prevRound[i + 1], rightPayload);
    }
    prevRound = nextRound;
  }

  return matchIds;
}

export async function setMatchResult({ matchId, homeScore, awayScore, winnerSide = null }) {
  const cols = await getJogosColumns();
  const nextCols = await resolveNextColumns();
  const slotValues = await resolveNextSlotValues();
  const statusValues = await resolveStatusValues();
  const rows = await dbQuery('SELECT * FROM jogos WHERE id = :id LIMIT 1', { id: matchId });
  if (!rows.length) return null;
  const match = rows[0];

  await updateJogo(matchId, {
    placar_a: homeScore,
    placar_b: awayScore,
    status: statusValues.done,
  });

  let winner = null;
  if (Number(homeScore) > Number(awayScore)) winner = 'A';
  if (Number(awayScore) > Number(homeScore)) winner = 'B';
  if (!winner && winnerSide) {
    const side = String(winnerSide).toUpperCase();
    if (side === 'A' || side === 'HOME') winner = 'A';
    if (side === 'B' || side === 'AWAY') winner = 'B';
  }

  const winnerLabel = winner === 'B' ? match.equipe_b : match.equipe_a;
  const winnerTeamId = winner === 'B' ? match.away_team_id : match.home_team_id;

  const nextId = nextCols.nextIdCol ? match[nextCols.nextIdCol] : null;
  const nextSlot = nextCols.nextSlotCol ? match[nextCols.nextSlotCol] : null;
  if (nextId && nextSlot && winner) {
    const normalizedSlot = String(nextSlot).toUpperCase();
    const toHome = normalizedSlot === String(slotValues.home).toUpperCase();
    const payload = toHome
      ? {
          ...(cols.has('equipe_a') ? { equipe_a: winnerLabel } : {}),
          ...(cols.has('home_team_id') ? { home_team_id: winnerTeamId } : {}),
        }
      : {
          ...(cols.has('equipe_b') ? { equipe_b: winnerLabel } : {}),
          ...(cols.has('away_team_id') ? { away_team_id: winnerTeamId } : {}),
        };
    await updateJogo(nextId, payload);
  }

  const updated = await dbQuery('SELECT * FROM jogos WHERE id = :id LIMIT 1', { id: matchId });
  return updated[0] || null;
}

export async function listMatchesByStage(stageId) {
  const cols = await getJogosColumns();
  if (!cols.has('stage_id')) return [];
  return dbQuery(
    'SELECT * FROM jogos WHERE stage_id = :stage_id ORDER BY id ASC',
    { stage_id: stageId }
  );
}
