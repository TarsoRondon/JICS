import { computeGroupSizes } from '../utils/groupSizing.util.js';
import { computeStandingsFromMatches } from '../utils/standings.util.js';
import { shuffle } from '../utils/shuffle.util.js';
import { getOrCreateFormatConfig } from './formatConfig.service.js';
import { createStage, closeStage, getOpenStage, listStages } from './stages.service.js';
import { createGroups, assignTeamsToGroups, listGroupsByStageIds, listGroupTeamsByGroupIds } from './groups.service.js';
import { createGroupMatches, createKnockoutMatches, listMatchesByStage } from './matches.service.js';
import { getTeamsFromInscricoes } from './entries.service.js';
import { dbQuery } from '../db/conn.js';
import { resolveStatusValues } from './jogosAdapter.service.js';

function buildGroupNames(count, prefix = '') {
  const names = [];
  for (let i = 0; i < count; i += 1) {
    const label = String.fromCharCode(65 + i);
    names.push(prefix ? `${prefix}${label}` : label);
  }
  return names;
}

function pickTopN(standings, n) {
  return standings.slice(0, n);
}

function pickWinnersPerGroup(standingsByGroup) {
  return standingsByGroup.flatMap(s => s[0] ? [s[0]] : []);
}

function pickSecondPerGroup(standingsByGroup) {
  return standingsByGroup.flatMap(s => s[1] ? [s[1]] : []);
}

function bestSecond(standingsByGroup) {
  const seconds = pickSecondPerGroup(standingsByGroup);
  return seconds.sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (b.saldo !== a.saldo) return b.saldo - a.saldo;
    if (b.pro !== a.pro) return b.pro - a.pro;
    return a.team.localeCompare(b.team);
  });
}

async function buildStandingsByGroup(groups) {
  const standingsByGroup = [];
  for (const group of groups) {
    const matches = await dbQuery('SELECT * FROM jogos WHERE group_id = :group_id', { group_id: group.id });
    const standings = computeStandingsFromMatches(matches);
    standingsByGroup.push(standings);
  }
  return standingsByGroup;
}

function normalizeTeams(list) {
  return list
    .map(t => ({
      label: t.team || t.label || t.team_label || t.equipe_nome,
      id: t.id || null,
    }))
    .filter(t => t.label);
}

export async function bootstrapTournament({ organization_id, evento_id, modalidade_id, sexo }) {
  const config = await getOrCreateFormatConfig({ organization_id, evento_id, modalidade_id, sexo });
  const existingStages = await listStages({ organization_id, evento_id, modalidade_id, sexo });
  if (existingStages.length) {
    throw new Error('Chaveamento ja existe para esta modalidade.');
  }
  const teams = await getTeamsFromInscricoes({ modalidade_id, sexo });
  if (teams.length < 2) {
    throw new Error('Numero insuficiente de equipes para sorteio.');
  }

  const groupSizes = computeGroupSizes(teams.length);
  const stage = await createStage({
    organization_id,
    evento_id,
    modalidade_id,
    sexo,
    nome: 'Fase de grupos',
    tipo: 'GROUP',
    ordem: 1,
    sort_on_entry: 1,
  });
  const groupNames = buildGroupNames(groupSizes.length);
  const groups = await createGroups(stage.id, groupNames);
  const groupTeams = await assignTeamsToGroups(groups, teams, groupSizes);

  for (const group of groups) {
    const teamsInGroup = groupTeams.filter(t => t.group_id === group.id);
    await createGroupMatches({
      organization_id,
      evento_id,
      modalidade_id,
      sexo,
      stage_id: stage.id,
      group,
      teams: teamsInGroup,
    });
  }

  return { config, stage, groups };
}

async function buildTriangularStage({ organization_id, evento_id, modalidade_id, sexo, ordem, teams }) {
  const stage = await createStage({
    organization_id,
    evento_id,
    modalidade_id,
    sexo,
    nome: 'Triangulares',
    tipo: 'GROUP',
    ordem,
    sort_on_entry: 1,
  });
  const groupNames = ['T1', 'T2'];
  const groups = await createGroups(stage.id, groupNames);
  const groupTeams = await assignTeamsToGroups(groups, teams, [3, 3]);
  for (const group of groups) {
    const teamsInGroup = groupTeams.filter(t => t.group_id === group.id);
    await createGroupMatches({
      organization_id,
      evento_id,
      modalidade_id,
      sexo,
      stage_id: stage.id,
      group,
      teams: teamsInGroup,
    });
  }
  return stage;
}

async function buildGroupStage({ organization_id, evento_id, modalidade_id, sexo, ordem, teams, groupSizes, name }) {
  const stage = await createStage({
    organization_id,
    evento_id,
    modalidade_id,
    sexo,
    nome: name,
    tipo: 'GROUP',
    ordem,
    sort_on_entry: 1,
  });
  const groupNames = buildGroupNames(groupSizes.length);
  const groups = await createGroups(stage.id, groupNames);
  const groupTeams = await assignTeamsToGroups(groups, teams, groupSizes);
  for (const group of groups) {
    const teamsInGroup = groupTeams.filter(t => t.group_id === group.id);
    await createGroupMatches({
      organization_id,
      evento_id,
      modalidade_id,
      sexo,
      stage_id: stage.id,
      group,
      teams: teamsInGroup,
    });
  }
  return stage;
}

async function buildKnockoutStage({ organization_id, evento_id, modalidade_id, sexo, ordem, teams, name, shuffleOnEntry }) {
  const stage = await createStage({
    organization_id,
    evento_id,
    modalidade_id,
    sexo,
    nome: name,
    tipo: 'KNOCKOUT',
    ordem,
    sort_on_entry: shuffleOnEntry ? 1 : 0,
  });
  const groups = await createGroups(stage.id, ['KO']);
  const groupTeams = await assignTeamsToGroups(groups, teams, [teams.length]);
  await createKnockoutMatches({
    organization_id,
    evento_id,
    modalidade_id,
    sexo,
    stage_id: stage.id,
    group_id: groups[0].id,
    teams: groupTeams,
    shuffleOnEntry,
  });
  return stage;
}

export async function closeCurrentStageAndAdvance({ organization_id, evento_id, modalidade_id, sexo, force = false }) {
  const config = await getOrCreateFormatConfig({ organization_id, evento_id, modalidade_id, sexo });
  const stage = await getOpenStage({ organization_id, evento_id, modalidade_id, sexo });
  if (!stage) return { done: true, message: 'Nenhuma etapa aberta.' };

  const matches = await listMatchesByStage(stage.id);
  const { done: doneStatus } = await resolveStatusValues();
  if (!force) {
    const doneLower = String(doneStatus || '').toLowerCase();
    const pending = matches.filter((m) => String(m.status || '').toLowerCase() !== doneLower);
    if (pending.length) {
      throw new Error('Existem jogos pendentes nesta etapa.');
    }
  }

  const groups = await listGroupsByStageIds([stage.id]);
  const standingsByGroup = await buildStandingsByGroup(groups);
  await closeStage(stage.id);

  const formatCode = config.format_code || config.format;
  const rules = config.rules_json ? JSON.parse(config.rules_json) : {};
  const shuffleOnKnockout = rules.shuffleOnKnockout !== false;
  const stageOrder = Number(stage.ordem ?? stage.order_index ?? 1);

  if (formatCode === 'A') {
    if (stageOrder === 1) {
      const winners = pickWinnersPerGroup(standingsByGroup);
      const teams = normalizeTeams(winners);
      if (teams.length === 6) {
        await buildTriangularStage({ organization_id, evento_id, modalidade_id, sexo, ordem: 2, teams });
      } else {
        const sizes = computeGroupSizes(teams.length);
        await buildGroupStage({
          organization_id,
          evento_id,
          modalidade_id,
          sexo,
          ordem: 2,
          teams,
          groupSizes: sizes,
          name: 'Triangulares',
        });
      }
      return { next: 2 };
    }
    if (stageOrder === 2) {
      const winners = pickWinnersPerGroup(standingsByGroup);
      const teams = normalizeTeams(winners);
      await buildKnockoutStage({ organization_id, evento_id, modalidade_id, sexo, ordem: 3, teams, name: 'Final', shuffleOnEntry: false });
      return { next: 3 };
    }
    return { done: true };
  }

  if (formatCode === 'B') {
    if (stageOrder === 1) {
      const winners = pickWinnersPerGroup(standingsByGroup);
      const teams = normalizeTeams(winners);
      const groupSizes = teams.length === 8 ? [4, 4] : computeGroupSizes(teams.length);
      await buildGroupStage({
        organization_id,
        evento_id,
        modalidade_id,
        sexo,
        ordem: 2,
        teams,
        groupSizes,
        name: '2a Fase',
      });
      return { next: 2 };
    }
    if (stageOrder === 2) {
      const top2 = standingsByGroup.flatMap(s => pickTopN(s, 2));
      const teams = normalizeTeams(top2);
      await buildKnockoutStage({
        organization_id,
        evento_id,
        modalidade_id,
        sexo,
        ordem: 3,
        teams,
        name: 'Semifinal e Final',
        shuffleOnEntry,
      });
      return { next: 3 };
    }
    return { done: true };
  }

  if (formatCode === 'C') {
    if (stageOrder === 1) {
      const winners = pickWinnersPerGroup(standingsByGroup);
      const seconds = bestSecond(standingsByGroup);
      const qualified = [...winners];
      for (const s of seconds) {
        if (qualified.length >= 8) break;
        qualified.push(s);
      }
      const teams = normalizeTeams(qualified);
      await buildKnockoutStage({
        organization_id,
        evento_id,
        modalidade_id,
        sexo,
        ordem: 2,
        teams,
        name: 'Quartas de final',
        shuffleOnEntry,
      });
      return { next: 2 };
    }
    return { done: true };
  }

  return { done: true };
}

export async function buildOverview({ organization_id, evento_id, modalidade_id, sexo }) {
  const sexoSafe = sexo || 'X';
  const config = await getOrCreateFormatConfig({ organization_id, evento_id, modalidade_id, sexo: sexoSafe });
  const stages = await listStages({ organization_id, evento_id, modalidade_id, sexo: sexo || undefined });
  const stageIds = stages.map(s => s.id);
  const groups = await listGroupsByStageIds(stageIds);
  const groupIds = groups.map(g => g.id);
  const groupTeams = await listGroupTeamsByGroupIds(groupIds);
  const matches = stageIds.length
    ? await dbQuery(`SELECT * FROM jogos WHERE stage_id IN (${stageIds.map(() => '?').join(',')}) ORDER BY id ASC`, stageIds)
    : [];

  const standings = {};
  for (const group of groups) {
    const groupMatches = matches.filter(m => m.group_id === group.id);
    standings[group.id] = computeStandingsFromMatches(groupMatches);
  }

  return { config, stages, groups, groupTeams, matches, standings };
}
