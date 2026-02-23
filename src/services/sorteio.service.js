import { pool, dbQuery } from '../db/conn.js';

let cachedJogosColumns = null;
let cachedSorteioMetaColumns = null;
let cachedJogosStatusValues = null;

async function getJogosColumns() {
  if (cachedJogosColumns) return cachedJogosColumns;
  const rows = await dbQuery(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'jogos'`
  );
  const cols = new Set(rows.map(r => r.COLUMN_NAME));
  cachedJogosColumns = cols;
  return cols;
}

function parseEnumValues(type) {
  const raw = String(type || '').trim();
  const match = raw.match(/enum\((.*)\)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(v => v.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

async function getJogosStatusValues() {
  if (cachedJogosStatusValues) return cachedJogosStatusValues;
  const rows = await dbQuery(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'jogos'
       AND COLUMN_NAME = 'status'
     LIMIT 1`
  );
  cachedJogosStatusValues = rows.length ? parseEnumValues(rows[0].COLUMN_TYPE) : [];
  return cachedJogosStatusValues;
}

function pickStatusValue(values, candidates) {
  for (const c of candidates) {
    if (values.includes(c)) return c;
  }
  return values[0] || null;
}

async function getSorteioMetaColumns() {
  if (cachedSorteioMetaColumns) return cachedSorteioMetaColumns;
  const rows = await dbQuery(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'sorteio_meta'`
  );
  const cols = new Set(rows.map(r => r.COLUMN_NAME));
  cachedSorteioMetaColumns = cols;
  return cols;
}

function pickTimeColumn(cols) {
  if (cols.has('hora_oficial')) return 'hora_oficial';
  if (cols.has('hora_texto')) return 'hora_texto';
  return null;
}

function pickLabelColumn(cols) {
  if (cols.has('numero_jogo')) return 'numero_jogo';
  if (cols.has('jogo_label')) return 'jogo_label';
  return null;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sanitizeTeamLabel(value) {
  return String(value || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTeamKey(value) {
  return sanitizeTeamLabel(value).toUpperCase();
}

function uniqueTeams(teams) {
  const list = Array.isArray(teams) ? teams : [];
  const seen = new Set();
  const unique = [];
  list.forEach((team) => {
    const clean = sanitizeTeamLabel(team);
    if (!clean || clean === 'BYE') return;
    const key = normalizeTeamKey(clean);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(clean);
  });
  return unique;
}

function calcularTamanhosChaves(total) {
  if (total <= 0) return [];
  // Ate 5 equipes: todos contra todos em uma unica chave.
  if (total <= 5) return [total];

  const gruposBase = Math.floor(total / 3);
  const resto = total % 3;

  if (resto === 0) {
    return Array.from({ length: gruposBase }, () => 3);
  }
  if (resto === 1 && gruposBase >= 1) {
    return [
      ...Array.from({ length: gruposBase - 1 }, () => 3),
      4,
    ];
  }
  if (resto === 2 && gruposBase >= 2) {
    return [
      ...Array.from({ length: gruposBase - 2 }, () => 3),
      4,
      4,
    ];
  }

  // Fallback defensivo para evitar erro em cenarios inesperados.
  return [total];
}

function distribuirChaves(turmas) {
  const turmasUnicas = uniqueTeams(turmas);
  const total = turmasUnicas.length;
  const tamanhosChaves = calcularTamanhosChaves(total);
  const chaves = Array.from({ length: tamanhosChaves.length }, (_, idx) => ({
    chave: `CH ${String.fromCharCode(65 + idx)}`,
    turmas: [],
  }));

  const embaralhadas = shuffle(turmasUnicas);
  let start = 0;
  chaves.forEach((chave, idx) => {
    const tamanho = tamanhosChaves[idx] || 0;
    chave.turmas = embaralhadas.slice(start, start + tamanho);
    start += tamanho;
  });

  return chaves;
}

function roundRobin(teams) {
  const list = uniqueTeams(teams);
  if (list.length < 2) return [];
  if (list.length % 2 === 1) list.push('BYE');
  const n = list.length;
  const rounds = n - 1;
  const half = n / 2;
  const jogos = [];

  let arr = [...list];
  for (let round = 0; round < rounds; round += 1) {
    for (let i = 0; i < half; i += 1) {
      const t1 = arr[i];
      const t2 = arr[n - 1 - i];
      const k1 = normalizeTeamKey(t1);
      const k2 = normalizeTeamKey(t2);
      if (t1 !== 'BYE' && t2 !== 'BYE' && k1 && k2 && k1 !== k2) {
        jogos.push({ equipeA: t1, equipeB: t2, rodada: round + 1 });
      }
    }
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [fixed, ...rest];
  }
  return jogos;
}

export function gerarRoundRobinTurmas(turmas) {
  const turmasUnicas = uniqueTeams(turmas);
  if (turmasUnicas.length < 2) {
    return { jogos: [], chaves_qtd: 0 };
  }
  const chaves = distribuirChaves(turmasUnicas);
  const jogos = [];
  chaves.forEach(({ chave, turmas: lista }) => {
    const rr = roundRobin(lista);
    rr.forEach((j) => jogos.push({ chave, equipeA: j.equipeA, equipeB: j.equipeB }));
  });
  return { jogos, chaves_qtd: chaves.length };
}

export function aplicarHorarios(jogos, horaInicio = '07:30', intervaloMin = 0) {
  const [h, m] = horaInicio.split(':').map(Number);
  let totalMin = h * 60 + m;
  return jogos.map((j, idx) => {
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    totalMin += Number(intervaloMin || 0);
    return { ...j, ordem: idx + 1, hora: `${hh}:${mm}` };
  });
}

export function calcularRanking(jogosFinalizados) {
  const mapa = {};
  jogosFinalizados.forEach((j) => {
    const chave = j.chave || 'CH A';
    if (!mapa[chave]) mapa[chave] = {};

    const init = (equipe) => {
      if (!mapa[chave][equipe]) {
        mapa[chave][equipe] = {
          equipe,
          pontos: 0,
          vitorias: 0,
          empates: 0,
          derrotas: 0,
          gols_pro: 0,
          gols_contra: 0,
          saldo: 0,
          jogos: 0,
        };
      }
    };

    init(j.equipe_a);
    init(j.equipe_b);

    const a = mapa[chave][j.equipe_a];
    const b = mapa[chave][j.equipe_b];
    const placarA = Number(j.placar_a || 0);
    const placarB = Number(j.placar_b || 0);

    a.gols_pro += placarA;
    a.gols_contra += placarB;
    b.gols_pro += placarB;
    b.gols_contra += placarA;
    a.saldo = a.gols_pro - a.gols_contra;
    b.saldo = b.gols_pro - b.gols_contra;
    a.jogos += 1;
    b.jogos += 1;

    if (placarA > placarB) {
      a.vitorias += 1;
      b.derrotas += 1;
      a.pontos += 3;
    } else if (placarB > placarA) {
      b.vitorias += 1;
      a.derrotas += 1;
      b.pontos += 3;
    } else {
      a.empates += 1;
      b.empates += 1;
      a.pontos += 1;
      b.pontos += 1;
    }
  });

  const ranking = {};
  Object.keys(mapa).forEach((chave) => {
    ranking[chave] = Object.values(mapa[chave]).sort((x, y) => {
      if (y.pontos !== x.pontos) return y.pontos - x.pontos;
      if (y.vitorias !== x.vitorias) return y.vitorias - x.vitorias;
      if (y.saldo !== x.saldo) return y.saldo - x.saldo;
      return (y.gols_pro || 0) - (x.gols_pro || 0);
    });
  });

  return ranking;
}

export async function buscarSorteio({ organization_id, evento_id, modalidade_id, sexo }) {
  const jogosCols = await getJogosColumns();
  const hasOrg = jogosCols.has('organization_id');
  const hasEvento = jogosCols.has('evento_id');
  const hasModalidade = jogosCols.has('modalidade_id');
  const hasSexo = jogosCols.has('sexo');
  const jogosParams = {};
  const jogosWhere = [];
  if (hasOrg) { jogosParams.organization_id = organization_id; jogosWhere.push('organization_id = :organization_id'); }
  if (hasEvento) { jogosParams.evento_id = evento_id; jogosWhere.push('evento_id = :evento_id'); }
  if (hasModalidade) { jogosParams.modalidade_id = modalidade_id; jogosWhere.push('modalidade_id = :modalidade_id'); }
  if (hasSexo) { jogosParams.sexo = sexo; jogosWhere.push('sexo = :sexo'); }
  const hasOrdem = jogosCols.has('ordem');
  const rows = await dbQuery(
    `SELECT * FROM jogos
     ${jogosWhere.length ? `WHERE ${jogosWhere.join(' AND ')}` : ''}
     ORDER BY ${hasOrdem ? 'ordem ASC,' : ''} id ASC`,
    jogosParams
  );

  const metaCols = await getSorteioMetaColumns();
  const metaHasOrg = metaCols.has('organization_id');
  const metaHasEvento = metaCols.has('evento_id');
  const metaHasModalidade = metaCols.has('modalidade_id');
  const metaHasSexo = metaCols.has('sexo');
  const metaParams = {};
  const metaWhere = [];
  if (metaHasOrg) { metaParams.organization_id = organization_id; metaWhere.push('organization_id = :organization_id'); }
  if (metaHasEvento) { metaParams.evento_id = evento_id; metaWhere.push('evento_id = :evento_id'); }
  if (metaHasModalidade) { metaParams.modalidade_id = modalidade_id; metaWhere.push('modalidade_id = :modalidade_id'); }
  if (metaHasSexo) { metaParams.sexo = sexo; metaWhere.push('sexo = :sexo'); }
  const meta = await dbQuery(
    `SELECT * FROM sorteio_meta
     ${metaWhere.length ? `WHERE ${metaWhere.join(' AND ')}` : ''}
     LIMIT 1`,
    metaParams
  );

  return { jogos: rows, meta: meta[0] || null };
}

export async function salvarSorteio({
  organization_id,
  evento_id,
  modalidade_id,
  sexo,
  modo,
  local_jogos,
  hora_inicio,
  intervalo_min,
  chaves_qtd,
  jogos,
}) {
  const cols = await getJogosColumns();
  const statusValues = await getJogosStatusValues();
  const statusPending = pickStatusValue(statusValues, ['NAO_INICIADO', 'SCHEDULED', 'agendado', 'PENDENTE']);
  const timeCol = pickTimeColumn(cols);
  const labelCol = pickLabelColumn(cols);
  const hasOrg = cols.has('organization_id');
  const hasEvento = cols.has('evento_id');
  const hasModalidade = cols.has('modalidade_id');
  const hasSexo = cols.has('sexo');

  const baseCols = [
    hasOrg ? 'organization_id' : null,
    hasEvento ? 'evento_id' : null,
    hasModalidade ? 'modalidade_id' : null,
    hasSexo ? 'sexo' : null,
    'chave',
    'equipe_a',
    'equipe_b',
    'status'
  ]
    .filter(Boolean);
  if (cols.has('ordem')) baseCols.push('ordem');
  if (labelCol) baseCols.push(labelCol);
  if (timeCol) baseCols.push(timeCol);
  if (cols.has('fase')) baseCols.push('fase');
  const labelIsNumero = labelCol === 'numero_jogo';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (hasOrg || hasEvento || hasModalidade || hasSexo) {
      const whereParts = [];
      const whereParams = [];
      if (hasOrg) { whereParts.push('organization_id = ?'); whereParams.push(organization_id); }
      if (hasEvento) { whereParts.push('evento_id = ?'); whereParams.push(evento_id); }
      if (hasModalidade) { whereParts.push('modalidade_id = ?'); whereParams.push(modalidade_id); }
      if (hasSexo) { whereParts.push('sexo = ?'); whereParams.push(sexo); }
      await conn.query(
        `DELETE FROM jogos
         WHERE ${whereParts.join(' AND ')}`,
        whereParams
      );
    } else {
      await conn.query(
        `DELETE FROM jogos`,
        []
      );
    }

    const jogosValidos = (Array.isArray(jogos) ? jogos : [])
      .filter((j) => {
        const a = normalizeTeamKey(j?.equipeA);
        const b = normalizeTeamKey(j?.equipeB);
        return Boolean(a) && Boolean(b) && a !== b;
      });

    if (jogosValidos.length) {
      const values = jogosValidos.map((j, idx) => {
        const row = [];
        baseCols.forEach((col) => {
          switch (col) {
            case 'organization_id': row.push(organization_id); break;
            case 'evento_id': row.push(evento_id); break;
            case 'modalidade_id': row.push(modalidade_id); break;
            case 'sexo': row.push(sexo); break;
            case 'chave': row.push(j.chave || 'CH A'); break;
            case 'equipe_a': row.push(sanitizeTeamLabel(j.equipeA) || 'A definir'); break;
            case 'equipe_b': row.push(sanitizeTeamLabel(j.equipeB) || 'A definir'); break;
            case 'status': row.push(statusPending || 'NAO_INICIADO'); break;
            case 'ordem': row.push(j.ordem || idx + 1); break;
            case 'fase': row.push('GRUPOS'); break;
            case timeCol: row.push(j.hora || null); break;
            case labelCol: {
              if (labelIsNumero) {
                const raw = j.numero_jogo ?? j.jogo ?? (idx + 1);
                const num = Number(String(raw).replace(/\D/g, '')) || (idx + 1);
                row.push(num);
              } else {
                row.push(j.numero_jogo || j.jogo || `J${idx + 1}`);
              }
              break;
            }
            default: row.push(null);
          }
        });
        return row;
      });
      await conn.query(
        `INSERT INTO jogos (${baseCols.join(', ')}) VALUES ?`,
        [values]
      );
    }

    const metaCols = await getSorteioMetaColumns();
    const metaHasOrg = metaCols.has('organization_id');
    const metaHasEvento = metaCols.has('evento_id');
    const metaHasModalidade = metaCols.has('modalidade_id');
    const metaHasSexo = metaCols.has('sexo');
    const metaHasModo = metaCols.has('modo');
    const metaHasLocal = metaCols.has('local_jogos');
    const metaHasHoraInicio = metaCols.has('hora_inicio');
    const metaHasIntervalo = metaCols.has('intervalo_min');
    const metaHasChaves = metaCols.has('chaves_qtd');
    const metaFields = [
      metaHasOrg ? 'organization_id' : null,
      metaHasEvento ? 'evento_id' : null,
      metaHasModalidade ? 'modalidade_id' : null,
      metaHasSexo ? 'sexo' : null,
      metaHasModo ? 'modo' : null,
      metaHasLocal ? 'local_jogos' : null,
      metaHasHoraInicio ? 'hora_inicio' : null,
      metaHasIntervalo ? 'intervalo_min' : null,
      metaHasChaves ? 'chaves_qtd' : null,
    ].filter(Boolean);
    if (!metaFields.length) {
      await conn.commit();
      return;
    }
    const metaValues = [
      metaHasOrg ? organization_id : null,
      metaHasEvento ? evento_id : null,
      metaHasModalidade ? modalidade_id : null,
      metaHasSexo ? sexo : null,
      metaHasModo ? (modo || 'GRUPOS') : null,
      metaHasLocal ? (local_jogos || 'Quadra A') : null,
      metaHasHoraInicio ? (hora_inicio || '07:30') : null,
      metaHasIntervalo ? (intervalo_min || 10) : null,
      metaHasChaves ? (chaves_qtd || 1) : null,
    ].filter(v => v !== null);
    const placeholders = metaFields.map(() => '?').join(',');
    const updateFields = [
      metaHasModo ? 'modo' : null,
      metaHasLocal ? 'local_jogos' : null,
      metaHasHoraInicio ? 'hora_inicio' : null,
      metaHasIntervalo ? 'intervalo_min' : null,
      metaHasChaves ? 'chaves_qtd' : null,
    ].filter(Boolean);
    const updateSql = updateFields.map(f => `${f} = VALUES(${f})`).join(', ');
    await conn.query(
      `INSERT INTO sorteio_meta
        (${metaFields.join(', ')})
       VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE
        ${updateSql}`,
      metaValues
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function aplicarHorariosEmJogos({ organization_id, evento_id, modalidade_id, sexo, hora_inicio, intervalo_min }) {
  const cols = await getJogosColumns();
  const timeCol = pickTimeColumn(cols);
  if (!timeCol) return;
  const hasOrg = cols.has('organization_id');
  const hasEvento = cols.has('evento_id');
  const hasModalidade = cols.has('modalidade_id');
  const hasSexo = cols.has('sexo');

  const jogosParams = {};
  const jogosWhere = [];
  if (hasOrg) { jogosParams.organization_id = organization_id; jogosWhere.push('organization_id = :organization_id'); }
  if (hasEvento) { jogosParams.evento_id = evento_id; jogosWhere.push('evento_id = :evento_id'); }
  if (hasModalidade) { jogosParams.modalidade_id = modalidade_id; jogosWhere.push('modalidade_id = :modalidade_id'); }
  if (hasSexo) { jogosParams.sexo = sexo; jogosWhere.push('sexo = :sexo'); }
  const jogos = await dbQuery(
    `SELECT id
     FROM jogos
     ${jogosWhere.length ? `WHERE ${jogosWhere.join(' AND ')}` : ''}
     ORDER BY ${cols.has('ordem') ? 'ordem ASC,' : ''} id ASC`,
    jogosParams
  );

  const atualizados = aplicarHorarios(
    jogos.map((j) => ({ id: j.id })),
    hora_inicio,
    intervalo_min
  );

  if (!atualizados.length) return;

  const ids = atualizados.map(j => j.id);
  const cases = atualizados.map(() => 'WHEN ? THEN ?').join(' ');
  const params = [];
  atualizados.forEach((j) => {
    params.push(j.id, j.hora);
  });

  await dbQuery(
    `UPDATE jogos
     SET ${timeCol} = CASE id ${cases} END
     WHERE id IN (${ids.map(() => '?').join(',')})`,
    [...params, ...ids]
  );

  const metaCols = await getSorteioMetaColumns();
  const metaHasOrg = metaCols.has('organization_id');
  const metaHasEvento = metaCols.has('evento_id');
  const metaHasModalidade = metaCols.has('modalidade_id');
  const metaHasSexo = metaCols.has('sexo');
  const metaHasHoraInicio = metaCols.has('hora_inicio');
  const metaHasIntervalo = metaCols.has('intervalo_min');
  const setParts = [];
  const metaParams = {};
  if (metaHasHoraInicio) {
    setParts.push('hora_inicio = :hora_inicio');
    metaParams.hora_inicio = hora_inicio;
  }
  if (metaHasIntervalo) {
    setParts.push('intervalo_min = :intervalo_min');
    metaParams.intervalo_min = intervalo_min;
  }
  if (setParts.length) {
    const metaWhere = [];
    if (metaHasOrg) { metaParams.organization_id = organization_id; metaWhere.push('organization_id = :organization_id'); }
    if (metaHasEvento) { metaParams.evento_id = evento_id; metaWhere.push('evento_id = :evento_id'); }
    if (metaHasModalidade) { metaParams.modalidade_id = modalidade_id; metaWhere.push('modalidade_id = :modalidade_id'); }
    if (metaHasSexo) { metaParams.sexo = sexo; metaWhere.push('sexo = :sexo'); }
    await dbQuery(
      `UPDATE sorteio_meta
       SET ${setParts.join(', ')}
       ${metaWhere.length ? `WHERE ${metaWhere.join(' AND ')}` : ''}`,
      metaParams
    );
  }
}

export async function limparSorteio({ organization_id, evento_id, modalidade_id, sexo }) {
  const conn = await pool.getConnection();
  const cols = await getJogosColumns();
  const hasOrg = cols.has('organization_id');
  const hasEvento = cols.has('evento_id');
  const hasModalidade = cols.has('modalidade_id');
  const hasSexo = cols.has('sexo');
  const metaCols = await getSorteioMetaColumns();
  const metaHasOrg = metaCols.has('organization_id');
  const metaHasEvento = metaCols.has('evento_id');
  const metaHasModalidade = metaCols.has('modalidade_id');
  const metaHasSexo = metaCols.has('sexo');
  try {
    await conn.beginTransaction();
    if (hasOrg || hasEvento || hasModalidade || hasSexo) {
      const whereParts = [];
      const whereParams = [];
      if (hasOrg) { whereParts.push('organization_id = ?'); whereParams.push(organization_id); }
      if (hasEvento) { whereParts.push('evento_id = ?'); whereParams.push(evento_id); }
      if (hasModalidade) { whereParts.push('modalidade_id = ?'); whereParams.push(modalidade_id); }
      if (hasSexo) { whereParts.push('sexo = ?'); whereParams.push(sexo); }
      await conn.query(
        `DELETE FROM jogos
         WHERE ${whereParts.join(' AND ')}`,
        whereParams
      );
    } else {
      await conn.query(
        `DELETE FROM jogos`,
        []
      );
    }
    if (metaHasOrg || metaHasEvento || metaHasModalidade || metaHasSexo) {
      const metaParts = [];
      const metaParams = [];
      if (metaHasOrg) { metaParts.push('organization_id = ?'); metaParams.push(organization_id); }
      if (metaHasEvento) { metaParts.push('evento_id = ?'); metaParams.push(evento_id); }
      if (metaHasModalidade) { metaParts.push('modalidade_id = ?'); metaParams.push(modalidade_id); }
      if (metaHasSexo) { metaParts.push('sexo = ?'); metaParams.push(sexo); }
      await conn.query(
        `DELETE FROM sorteio_meta
         WHERE ${metaParts.join(' AND ')}`,
        metaParams
      );
    } else {
      await conn.query(
        `DELETE FROM sorteio_meta`,
        []
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function buscarTurmasInscritas({ modalidade_id, sexo }) {
  const rows = await dbQuery(
    `SELECT DISTINCT TRIM(a.turma) AS turma
     FROM inscricoes i
     JOIN alunos a ON a.id = i.aluno_id
     WHERE i.modalidade_id = :modalidade_id
       AND (:sexo IS NULL OR a.sexo = :sexo)
       AND a.turma IS NOT NULL
       AND TRIM(a.turma) <> ''
     ORDER BY TRIM(a.turma) ASC`,
    { modalidade_id, sexo: sexo || null }
  );
  return rows.map(r => r.turma).filter(Boolean);
}
