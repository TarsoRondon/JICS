import { pool, dbQuery } from '../db/conn.js';

let cachedJogosColumns = null;

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

function distribuirChaves(turmas) {
  const total = turmas.length;
  let chavesQtd = 1;
  if (total >= 7 && total <= 12) chavesQtd = 2;
  else if (total >= 13 && total <= 18) chavesQtd = 3;
  else if (total >= 19) chavesQtd = 4;

  const chaves = Array.from({ length: chavesQtd }, (_, idx) => ({
    chave: `CH ${String.fromCharCode(65 + idx)}`,
    turmas: [],
  }));

  const embaralhadas = shuffle(turmas);
  embaralhadas.forEach((turma, idx) => {
    chaves[idx % chavesQtd].turmas.push(turma);
  });

  return chaves;
}

function roundRobin(teams) {
  const list = [...teams];
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
      if (t1 !== 'BYE' && t2 !== 'BYE') {
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
  const chaves = distribuirChaves(turmas);
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
  const rows = await dbQuery(
    `SELECT * FROM jogos
     WHERE organization_id = :organization_id
       AND evento_id = :evento_id
       AND modalidade_id = :modalidade_id
       AND sexo = :sexo
     ORDER BY ordem ASC, id ASC`,
    { organization_id, evento_id, modalidade_id, sexo }
  );

  const meta = await dbQuery(
    `SELECT * FROM sorteio_meta
     WHERE organization_id = :organization_id
       AND evento_id = :evento_id
       AND modalidade_id = :modalidade_id
       AND sexo = :sexo
     LIMIT 1`,
    { organization_id, evento_id, modalidade_id, sexo }
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
  const timeCol = pickTimeColumn(cols);
  const labelCol = pickLabelColumn(cols);

  const baseCols = ['organization_id', 'evento_id', 'modalidade_id', 'sexo', 'chave', 'equipe_a', 'equipe_b', 'status'];
  if (cols.has('ordem')) baseCols.push('ordem');
  if (labelCol) baseCols.push(labelCol);
  if (timeCol) baseCols.push(timeCol);
  if (cols.has('fase')) baseCols.push('fase');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `DELETE FROM jogos
       WHERE organization_id = ? AND evento_id = ? AND modalidade_id = ? AND sexo = ?`,
      [organization_id, evento_id, modalidade_id, sexo]
    );

    if (jogos && jogos.length) {
      const values = jogos.map((j, idx) => {
        const row = [];
        baseCols.forEach((col) => {
          switch (col) {
            case 'organization_id': row.push(organization_id); break;
            case 'evento_id': row.push(evento_id); break;
            case 'modalidade_id': row.push(modalidade_id); break;
            case 'sexo': row.push(sexo); break;
            case 'chave': row.push(j.chave || 'CH A'); break;
            case 'equipe_a': row.push(j.equipeA); break;
            case 'equipe_b': row.push(j.equipeB); break;
            case 'status': row.push('NAO_INICIADO'); break;
            case 'ordem': row.push(j.ordem || idx + 1); break;
            case 'fase': row.push('GRUPOS'); break;
            case timeCol: row.push(j.hora || null); break;
            case labelCol: row.push(j.numero_jogo || j.jogo || `J${idx + 1}`); break;
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

    await conn.query(
      `INSERT INTO sorteio_meta
        (organization_id, evento_id, modalidade_id, sexo, modo, local_jogos, hora_inicio, intervalo_min, chaves_qtd)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
        modo = VALUES(modo),
        local_jogos = VALUES(local_jogos),
        hora_inicio = VALUES(hora_inicio),
        intervalo_min = VALUES(intervalo_min),
        chaves_qtd = VALUES(chaves_qtd)`,
      [
        organization_id,
        evento_id,
        modalidade_id,
        sexo,
        modo || 'GRUPOS',
        local_jogos || 'Quadra A',
        hora_inicio || '07:30',
        intervalo_min || 10,
        chaves_qtd || 1,
      ]
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

  const jogos = await dbQuery(
    `SELECT id
     FROM jogos
     WHERE organization_id = :organization_id
       AND evento_id = :evento_id
       AND modalidade_id = :modalidade_id
       AND sexo = :sexo
     ORDER BY ordem ASC, id ASC`,
    { organization_id, evento_id, modalidade_id, sexo }
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

  await dbQuery(
    `UPDATE sorteio_meta
     SET hora_inicio = :hora_inicio,
         intervalo_min = :intervalo_min
     WHERE organization_id = :organization_id
       AND evento_id = :evento_id
       AND modalidade_id = :modalidade_id
       AND sexo = :sexo`,
    { organization_id, evento_id, modalidade_id, sexo, hora_inicio, intervalo_min }
  );
}

export async function limparSorteio({ organization_id, evento_id, modalidade_id, sexo }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `DELETE FROM jogos
       WHERE organization_id = ? AND evento_id = ? AND modalidade_id = ? AND sexo = ?`,
      [organization_id, evento_id, modalidade_id, sexo]
    );
    await conn.query(
      `DELETE FROM sorteio_meta
       WHERE organization_id = ? AND evento_id = ? AND modalidade_id = ? AND sexo = ?`,
      [organization_id, evento_id, modalidade_id, sexo]
    );
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
    `SELECT DISTINCT a.turma
     FROM inscricoes i
     JOIN alunos a ON a.id = i.aluno_id
     WHERE i.modalidade_id = :modalidade_id
       AND (:sexo IS NULL OR a.sexo = :sexo)
       AND a.turma IS NOT NULL
     ORDER BY a.turma ASC`,
    { modalidade_id, sexo: sexo || null }
  );
  return rows.map(r => r.turma).filter(Boolean);
}

