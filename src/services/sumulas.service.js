import { dbQuery, pool } from '../db/conn.js';
import {
  getJogosColumns,
  resolveStatusValues,
  resolveNextColumns,
  resolveNextSlotValues,
} from './jogosAdapter.service.js';

let cachedHasJogoJogadoresTable = null;
let cachedInscricoesHasNumeroCamisa = null;

export async function getStandings({ modalidadeId, sexo, chave }) {
  const cols = await getJogosColumns();
  const { done } = await resolveStatusValues();
  const statusFilter = cols.has('status') ? 'AND status = :doneStatus' : '';
  const sql = `
    SELECT
      equipe,
      SUM(jogos) AS jogos,
      SUM(vitorias) AS vitorias,
      SUM(empates) AS empates,
      SUM(derrotas) AS derrotas,
      SUM(gols_pro) AS pro,
      SUM(gols_contra) AS contra,
      SUM(gols_pro - gols_contra) AS saldo,
      SUM(pontos) AS pontos
    FROM (
      SELECT
        equipe_a AS equipe,
        1 AS jogos,
        CASE WHEN placar_a > placar_b THEN 1 ELSE 0 END AS vitorias,
        CASE WHEN placar_a = placar_b THEN 1 ELSE 0 END AS empates,
        CASE WHEN placar_a < placar_b THEN 1 ELSE 0 END AS derrotas,
        placar_a AS gols_pro,
        placar_b AS gols_contra,
        CASE WHEN placar_a > placar_b THEN 3 WHEN placar_a = placar_b THEN 1 ELSE 0 END AS pontos
      FROM jogos
      WHERE modalidade_id = :m1
        AND sexo = :s1
        AND fase = 'GRUPOS'
        AND chave = :c1
        ${statusFilter}
        AND placar_a IS NOT NULL AND placar_b IS NOT NULL

      UNION ALL

      SELECT
        equipe_b AS equipe,
        1 AS jogos,
        CASE WHEN placar_b > placar_a THEN 1 ELSE 0 END AS vitorias,
        CASE WHEN placar_b = placar_a THEN 1 ELSE 0 END AS empates,
        CASE WHEN placar_b < placar_a THEN 1 ELSE 0 END AS derrotas,
        placar_b AS gols_pro,
        placar_a AS gols_contra,
        CASE WHEN placar_b > placar_a THEN 3 WHEN placar_b = placar_a THEN 1 ELSE 0 END AS pontos
      FROM jogos
      WHERE modalidade_id = :m2
        AND sexo = :s2
        AND fase = 'GRUPOS'
        AND chave = :c2
        ${statusFilter}
        AND placar_a IS NOT NULL AND placar_b IS NOT NULL
    ) t
    GROUP BY equipe
    ORDER BY pontos DESC, saldo DESC, pro DESC, vitorias DESC, equipe ASC
  `;

  return dbQuery(sql, {
    m1: modalidadeId,
    s1: sexo,
    c1: chave,
    m2: modalidadeId,
    s2: sexo,
    c2: chave,
    doneStatus: done,
  });
}

function normalizeTeamLabel(value) {
  return String(value || '')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTeamKey(value) {
  return normalizeTeamLabel(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeTeamCompact(value) {
  return normalizeTeamKey(value).replace(/[^A-Z0-9]/g, '');
}

function normalizeShirtNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '').trim();
  if (!digits) return null;
  return digits.slice(0, 4);
}

function teamMatches(turma, equipe) {
  const turmaKey = normalizeTeamKey(turma);
  const equipeKey = normalizeTeamKey(equipe);
  if (!turmaKey || !equipeKey) return false;
  if (turmaKey === equipeKey) return true;

  const turmaCompact = normalizeTeamCompact(turmaKey);
  const equipeCompact = normalizeTeamCompact(equipeKey);
  if (!turmaCompact || !equipeCompact) return false;
  if (turmaCompact === equipeCompact) return true;

  const minLen = 8;
  if (turmaCompact.length >= minLen && equipeCompact.includes(turmaCompact)) return true;
  if (equipeCompact.length >= minLen && turmaCompact.includes(equipeCompact)) return true;
  return false;
}

async function tableExists(tableName) {
  const rows = await dbQuery(
    `SELECT 1
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
      LIMIT 1`,
    { tableName }
  );
  return rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await dbQuery(
    `SELECT 1
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
        AND COLUMN_NAME = :columnName
      LIMIT 1`,
    { tableName, columnName }
  );
  return rows.length > 0;
}

async function hasJogoJogadoresTable() {
  if (cachedHasJogoJogadoresTable !== null) return cachedHasJogoJogadoresTable;
  cachedHasJogoJogadoresTable = await tableExists('jogo_jogadores');
  return cachedHasJogoJogadoresTable;
}

async function inscricoesHasNumeroCamisa() {
  if (cachedInscricoesHasNumeroCamisa !== null) return cachedInscricoesHasNumeroCamisa;
  cachedInscricoesHasNumeroCamisa = await columnExists('inscricoes', 'numero_camisa');
  return cachedInscricoesHasNumeroCamisa;
}

function upsertJogador(map, nome, numeroCamisa = null) {
  const cleanName = normalizeTeamLabel(nome);
  if (!cleanName) return;
  const key = normalizeTeamKey(cleanName);
  const shirt = normalizeShirtNumber(numeroCamisa);
  const prev = map.get(key) || { nome: cleanName, numero_camisa: null };
  if (!prev.numero_camisa && shirt) {
    prev.numero_camisa = shirt;
  }
  map.set(key, prev);
}

function toJogadoresList(map) {
  return Array.from(map.values())
    .map((item) => ({
      nome: normalizeTeamLabel(item.nome || ''),
      numero_camisa: normalizeShirtNumber(item.numero_camisa),
    }))
    .filter((item) => item.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

function normalizeJogadoresPayload(payload) {
  const normalizeList = (list) => {
    if (!Array.isArray(list)) return [];
    const map = new Map();
    for (const item of list) {
      const nome = normalizeTeamLabel(
        typeof item === 'string'
          ? item
          : (item?.nome || item?.player || '')
      );
      if (!nome) continue;
      const numeroCamisa = normalizeShirtNumber(
        typeof item === 'string'
          ? null
          : (item?.numero_camisa ?? item?.shirt ?? item?.camisa ?? null)
      );
      upsertJogador(map, nome, numeroCamisa);
    }
    return toJogadoresList(map).slice(0, 120);
  };

  if (!payload || typeof payload !== 'object') {
    return { A: [], B: [] };
  }

  return {
    A: normalizeList(payload.A || payload.a || []),
    B: normalizeList(payload.B || payload.b || []),
  };
}

function normalizeCardsPayload(cards) {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((item) => {
      const team = String(item?.team || '').toUpperCase();
      const type = String(item?.type || '').toUpperCase();
      const player = normalizeTeamLabel(item?.player || '');
      const shirt = normalizeShirtNumber(item?.shirt ?? item?.numero_camisa ?? item?.camisa ?? null);
      const minuteRaw = String(item?.minute ?? '').trim();
      const note = normalizeTeamLabel(item?.note || '');
      if (!['A', 'B'].includes(team)) return null;
      if (!['YELLOW', 'RED'].includes(type)) return null;
      if (!player) return null;
      const minuteNum = minuteRaw === '' ? null : Number(minuteRaw);
      const minute = Number.isInteger(minuteNum) && minuteNum >= 0 ? minuteNum : null;
      return {
        team,
        player: player.slice(0, 150),
        shirt,
        type,
        minute,
        note: note.slice(0, 120),
      };
    })
    .filter(Boolean)
    .slice(0, 100);
}

function parseCardsFromRow(row) {
  if (!row) return [];
  const raw = row.cartoes_json ?? row.cartoes ?? null;
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return normalizeCardsPayload(parsed);
  } catch (_) {
    return [];
  }
}

function safeText(value, maxLen = 120) {
  return normalizeTeamLabel(value || '').slice(0, maxLen) || null;
}

export async function getJogoDetalhes({ jogoId }) {
  const rows = await dbQuery('SELECT * FROM jogos WHERE id = :id LIMIT 1', { id: jogoId });
  const jogo = rows[0];
  if (!jogo) {
    const err = new Error('Jogo nao encontrado');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const teamA = normalizeTeamLabel(jogo.equipe_a);
  const teamB = normalizeTeamLabel(jogo.equipe_b);
  const withCamisa = await inscricoesHasNumeroCamisa();
  const playersRows = await dbQuery(
    `SELECT
        a.nome AS nome,
        TRIM(REPLACE(REPLACE(a.turma, '\r', ''), '\n', '')) AS turma,
        ${withCamisa ? 'i.numero_camisa' : 'NULL AS numero_camisa'},
        a.sexo AS sexo_aluno
      FROM inscricoes i
      JOIN alunos a ON a.id = i.aluno_id
      WHERE i.modalidade_id = :modalidade_id
        AND a.turma IS NOT NULL
        AND TRIM(a.turma) <> ''
      ORDER BY a.nome ASC`,
    { modalidade_id: jogo.modalidade_id }
  );

  const sexoJogo = String(jogo.sexo || '').toUpperCase().trim();
  const jogadoresMapA = new Map();
  const jogadoresMapB = new Map();

  for (const row of playersRows) {
    const nome = normalizeTeamLabel(row.nome);
    const turma = normalizeTeamLabel(row.turma);
    const sexoAluno = String(row.sexo_aluno || '').toUpperCase().trim();
    if (!nome || !turma) continue;
    if (sexoJogo && sexoAluno && !sexoAluno.startsWith(sexoJogo)) continue;
    if (teamMatches(turma, teamA)) upsertJogador(jogadoresMapA, nome, row.numero_camisa);
    if (teamMatches(turma, teamB)) upsertJogador(jogadoresMapB, nome, row.numero_camisa);
  }

  if (await hasJogoJogadoresTable()) {
    const detalhesRows = await dbQuery(
      `SELECT equipe_lado, jogador_nome, numero_camisa
         FROM jogo_jogadores
        WHERE jogo_id = :jogo_id
        ORDER BY jogador_nome ASC`,
      { jogo_id: jogoId }
    );
    for (const row of detalhesRows) {
      const lado = String(row.equipe_lado || '').toUpperCase();
      const nome = normalizeTeamLabel(row.jogador_nome);
      const camisa = normalizeShirtNumber(row.numero_camisa);
      if (lado === 'A') upsertJogador(jogadoresMapA, nome, camisa);
      if (lado === 'B') upsertJogador(jogadoresMapB, nome, camisa);
    }
  }

  return {
    jogo,
    jogadoresA: toJogadoresList(jogadoresMapA),
    jogadoresB: toJogadoresList(jogadoresMapB),
    cartoes: parseCardsFromRow(jogo),
  };
}

function normalizeWinnerSide(value) {
  const side = String(value || '').toUpperCase().trim();
  if (side === 'A' || side === 'HOME') return 'A';
  if (side === 'B' || side === 'AWAY') return 'B';
  return null;
}

function isGroupFase(fase) {
  return String(fase || '').toUpperCase() === 'GRUPOS';
}

export async function saveSumula({
  jogoId,
  placarA,
  placarB,
  wo,
  observacoes,
  winner_side = null,
  arbitro_nome = null,
  mesario_nome = null,
  cartoes = [],
  jogadores = null,
}) {
  const cols = await getJogosColumns();
  const { done } = await resolveStatusValues();
  const nextCols = await resolveNextColumns();
  const nextSlots = await resolveNextSlotValues();
  const cardsNormalized = normalizeCardsPayload(cartoes);
  const cardsPayload = JSON.stringify(cardsNormalized);
  const jogadoresPayload = normalizeJogadoresPayload(jogadores);
  const sets = [
    'placar_a = :placar_a',
    'placar_b = :placar_b',
    cols.has('wo') ? 'wo = :wo' : null,
    cols.has('observacoes') ? 'observacoes = :observacoes' : null,
    cols.has('arbitro_nome') ? 'arbitro_nome = :arbitro_nome' : null,
    cols.has('mesario_nome') ? 'mesario_nome = :mesario_nome' : null,
    cols.has('cartoes_json')
      ? 'cartoes_json = CAST(:cartoes_json AS JSON)'
      : (cols.has('cartoes') ? 'cartoes = :cartoes_json' : null),
  ];
  if (cols.has('status')) sets.push('status = :doneStatus');
  if (cols.has('finalizado_em')) sets.push('finalizado_em = NOW()');
  const updateSets = sets.filter(Boolean);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM jogos WHERE id = :id LIMIT 1 FOR UPDATE', { id: jogoId });
    const jogo = rows[0];
    if (!jogo) {
      const err = new Error('Jogo nao encontrado');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const tie = Number(placarA) === Number(placarB);
    const winnerSideNormalized = normalizeWinnerSide(winner_side);
    const grupo = isGroupFase(jogo.fase);
    if (!grupo && tie && !winnerSideNormalized) {
      const err = new Error('Empate em mata-mata exige vencedor.');
      err.code = 'TIE_BREAK_REQUIRED';
      throw err;
    }

    await conn.query(
      `UPDATE jogos
       SET ${updateSets.join(', ')}
       WHERE id = :id`,
      {
        placar_a: placarA,
        placar_b: placarB,
        wo: wo ? 1 : 0,
        observacoes: observacoes || null,
        arbitro_nome: safeText(arbitro_nome, 120),
        mesario_nome: safeText(mesario_nome, 120),
        cartoes_json: cardsPayload,
        doneStatus: done,
        id: jogoId,
      }
    );

    if (jogadores && await hasJogoJogadoresTable()) {
      await conn.query('DELETE FROM jogo_jogadores WHERE jogo_id = :jogo_id', { jogo_id: jogoId });
      const rowsToInsert = [
        ...jogadoresPayload.A.map((item) => ['A', item.nome, item.numero_camisa]),
        ...jogadoresPayload.B.map((item) => ['B', item.nome, item.numero_camisa]),
      ];
      if (rowsToInsert.length) {
        const placeholders = rowsToInsert.map(() => '(?, ?, ?, ?)').join(', ');
        const values = [];
        rowsToInsert.forEach((item) => {
          values.push(jogoId, item[0], item[1], item[2]);
        });
        await conn.query(
          `INSERT INTO jogo_jogadores (jogo_id, equipe_lado, jogador_nome, numero_camisa)
           VALUES ${placeholders}`,
          values
        );
      }
    }

    let advanced = null;
    const nextId = nextCols.nextIdCol ? jogo[nextCols.nextIdCol] : null;
    const nextSlot = nextCols.nextSlotCol ? jogo[nextCols.nextSlotCol] : null;

    if (!grupo && nextId && nextSlot) {
      let winner = 'A';
      if (Number(placarB) > Number(placarA)) winner = 'B';
      if (tie && winnerSideNormalized) winner = winnerSideNormalized;
      const winnerLabel = winner === 'A' ? jogo.equipe_a : jogo.equipe_b;
      const winnerTeamId = winner === 'A' ? jogo.home_team_id : jogo.away_team_id;
      const normalizedSlot = String(nextSlot).toUpperCase();
      const toA = normalizedSlot === String(nextSlots.home).toUpperCase();
      const nextSets = [];
      const nextParams = { nextId };
      if (toA && cols.has('equipe_a')) {
        nextSets.push('equipe_a = :winnerLabel');
        nextParams.winnerLabel = winnerLabel;
      }
      if (!toA && cols.has('equipe_b')) {
        nextSets.push('equipe_b = :winnerLabel');
        nextParams.winnerLabel = winnerLabel;
      }
      if (toA && cols.has('home_team_id')) {
        nextSets.push('home_team_id = :winnerTeamId');
        nextParams.winnerTeamId = winnerTeamId || null;
      }
      if (!toA && cols.has('away_team_id')) {
        nextSets.push('away_team_id = :winnerTeamId');
        nextParams.winnerTeamId = winnerTeamId || null;
      }
      if (nextSets.length) {
        await conn.query(
          `UPDATE jogos
           SET ${nextSets.join(', ')}
           WHERE id = :nextId`,
          nextParams
        );
      }
      const [nextRows] = await conn.query('SELECT * FROM jogos WHERE id = :id LIMIT 1', { id: nextId });
      advanced = {
        winner_side: winner,
        winner_team: winnerLabel,
        next_jogo_id: nextId,
        next_match: nextRows[0] || null,
      };
    }

    await conn.commit();
    const [updatedRows] = await conn.query('SELECT * FROM jogos WHERE id = :id LIMIT 1', { id: jogoId });
    const updated = updatedRows[0];
    return {
      jogo: updated,
      meta: { modalidade_id: jogo.modalidade_id, sexo: jogo.sexo, chave: jogo.chave, fase: jogo.fase },
      advanced,
    };
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    throw err;
  } finally {
    conn.release();
  }
}
