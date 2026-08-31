/**
 * JICS Service — Motor de Competição
 * Cobre: equipes, chaveamento, horários, súmulas, rankings, boletins
 */
import { conectar } from '../../testeConexao.js';
import { dbQuery } from '../db/conn.js';

// ════════════════════════════════════════
// TURMAS FIXAS (24 turmas imutáveis)
// ════════════════════════════════════════
export const TURMAS_FIXAS = (() => {
  const cursos = ['Química', 'Informática', 'Eletrotécnica', 'Edificações'];
  const series = ['1º', '2º', '3º'];
  const letras = ['A', 'B'];
  const turmas = [];
  let id = 1;
  for (const curso of cursos) {
    for (const serie of series) {
      for (const letra of letras) {
        turmas.push({ id: id++, curso, serie, letra, nome: `${serie} ${letra} — ${curso}` });
      }
    }
  }
  return turmas;
})();

export function getTurmaById(id) {
  return TURMAS_FIXAS.find(t => t.id === Number(id)) || null;
}

export function getTurmasByAluno(alunoTurma, alunoCurso) {
  return TURMAS_FIXAS.find(
    t => t.nome === alunoTurma || (t.curso === alunoCurso && alunoTurma?.includes(t.serie) && alunoTurma?.includes(t.letra))
  ) || null;
}

// ════════════════════════════════════════
// CHAVEAMENTO — ALGORITMO PRINCIPAL
// ════════════════════════════════════════

/**
 * Calcula a melhor distribuição de equipes em chaves.
 * Regras:
 *   - Prioridade máxima: 3 equipes/chave
 *   - Máximo: 4 equipes/chave
 *   - Máximo 8 chaves (A–H)
 *   - Evitar chaves de 1 equipe
 *   - Minimizar número total de jogos
 */
export function calcularDistribuicaoChaves(numEquipes) {
  if (numEquipes < 2) return null;

  const MAX_CHAVES = 8;
  const NOMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  // Limites de equipes por chave dado n chaves
  function distribuir(n, numChaves) {
    const chaves = [];
    const base = Math.floor(n / numChaves);
    const resto = n % numChaves;
    for (let i = 0; i < numChaves; i++) {
      chaves.push(base + (i < resto ? 1 : 0));
    }
    return chaves;
  }

  function contarJogos(distribuicao) {
    return distribuicao.reduce((total, t) => total + (t * (t - 1)) / 2, 0);
  }

  function isValida(distribuicao) {
    return distribuicao.every(t => t >= 2 && t <= 4);
  }

  // Quanto mais chaves de 3, melhor; penalizar chaves de 1
  function score(distribuicao) {
    const invalidas = distribuicao.filter(t => t < 2 || t > 4).length;
    const jogos = contarJogos(distribuicao);
    const de3 = distribuicao.filter(t => t === 3).length;
    return { invalidas, jogos, de3 };
  }

  let melhor = null;
  let melhorScore = null;

  const maxChaves = Math.min(MAX_CHAVES, Math.floor(numEquipes / 2));

  for (let numChaves = maxChaves; numChaves >= 1; numChaves--) {
    const dist = distribuir(numEquipes, numChaves);
    const s = score(dist);

    if (s.invalidas > 0) continue;

    if (!melhor ||
        s.jogos < melhorScore.jogos ||
        (s.jogos === melhorScore.jogos && s.de3 > melhorScore.de3)) {
      melhor = dist;
      melhorScore = s;
    }
  }

  if (!melhor) {
    // Fallback: distribui tentando respeitar o máximo possível
    const numChaves = Math.min(MAX_CHAVES, Math.ceil(numEquipes / 3));
    melhor = distribuir(numEquipes, numChaves);
  }

  return melhor.map((qtd, i) => ({ nome: NOMES[i], equipes: qtd }));
}

// ════════════════════════════════════════
// EQUIPES — criação idempotente
// ════════════════════════════════════════

export async function criarEquipeSeNaoExistir(turmaId, modalidadeId, categoria, eventoId) {
  const conexao = await conectar();
  try {
    const turma = getTurmaById(turmaId);
    if (!turma) throw new Error(`Turma ${turmaId} não encontrada`);

    const [mods] = await conexao.query('SELECT titulo FROM modalidades WHERE id = ?', [modalidadeId]);
    const modalidadeNome = mods[0]?.titulo || `Modalidade ${modalidadeId}`;

    const nome = `${turma.nome} — ${modalidadeNome} ${categoria}`;

    // Verifica se já existe
    const [existing] = await conexao.query(
      `SELECT id FROM equipes WHERE turma_id = ? AND modalidade_id = ? AND categoria = ? AND evento_id = ? LIMIT 1`,
      [turmaId, modalidadeId, categoria, eventoId]
    );

    if (existing.length > 0) return existing[0].id;

    const [result] = await conexao.query(
      `INSERT INTO equipes (nome, turma_id, modalidade_id, categoria, evento_id) VALUES (?, ?, ?, ?, ?)`,
      [nome, turmaId, modalidadeId, categoria, eventoId]
    );
    return result.insertId;
  } finally {
    await conexao.end();
  }
}

// ════════════════════════════════════════
// CHAVEAMENTO — geração automática
// ════════════════════════════════════════

export async function gerarChaveamentoJICS({ eventoId, modalidadeId, categoria, quadras = ['Quadra A'], dataInicio, horaInicio = '08:00', duracaoMin = 40, intervalMin = 20 }) {
  const conexao = await conectar();
  try {
    // Busca equipes inscritas
    const [equipes] = await conexao.query(
      `SELECT e.*, t.nome as turma_nome FROM equipes e 
       LEFT JOIN turmas_jics t ON t.id = e.turma_id
       WHERE e.evento_id = ? AND e.modalidade_id = ? AND e.categoria = ?`,
      [eventoId, modalidadeId, categoria]
    );

    if (equipes.length < 2) throw new Error('São necessárias pelo menos 2 equipes.');

    // Sorteia ordem
    const equipesEmbaralhadas = [...equipes].sort(() => Math.random() - 0.5);

    // Calcula distribuição de chaves
    const distribuicao = calcularDistribuicaoChaves(equipesEmbaralhadas.length);
    if (!distribuicao) throw new Error('Não foi possível calcular distribuição de chaves.');

    // Distribui equipes nas chaves
    const chaves = [];
    let idx = 0;
    for (const chave of distribuicao) {
      const equipesChave = equipesEmbaralhadas.slice(idx, idx + chave.equipes);
      idx += chave.equipes;
      chaves.push({ nome: chave.nome, equipes: equipesChave });
    }

    // Gera confrontos round-robin dentro de cada chave
    const confrontos = [];
    for (const chave of chaves) {
      const { nome: nomeChave, equipes: eqs } = chave;
      for (let i = 0; i < eqs.length; i++) {
        for (let j = i + 1; j < eqs.length; j++) {
          confrontos.push({
            chave: nomeChave,
            equipe_a: eqs[i],
            equipe_b: eqs[j],
            fase: 'GRUPOS',
          });
        }
      }
    }

    // Atribui horários sem conflito
    const agendados = atribuirHorarios(confrontos, quadras, dataInicio, horaInicio, duracaoMin, intervalMin);

    // Salva jogos no banco
    const jogosSalvos = [];
    for (const jogo of agendados) {
      const [res] = await conexao.query(
        `INSERT INTO jogos (evento_id, modalidade_id, categoria, equipe_a_id, equipe_b_id, chave, quadra, data_hora, fase, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENDADO')
         ON DUPLICATE KEY UPDATE status=status`,
        [eventoId, modalidadeId, categoria, jogo.equipe_a.id, jogo.equipe_b.id, jogo.chave, jogo.quadra, jogo.data_hora, jogo.fase]
      );
      jogosSalvos.push({ id: res.insertId, ...jogo });
    }

    return { chaves, confrontos: agendados, jogosSalvos };
  } finally {
    await conexao.end();
  }
}

// ════════════════════════════════════════
// SCHEDULER — sem conflitos
// ════════════════════════════════════════

function atribuirHorarios(confrontos, quadras, dataInicio, horaInicio, duracaoMin, intervalMin) {
  const resultado = [];
  // Map: quadra -> próxima disponibilidade (minutos desde meia-noite do dataInicio)
  const quadraDisponivel = {};
  // Map: equipe_id -> último fim de jogo (minutos)
  const equipeDisponivel = {};

  const [hora, minuto] = horaInicio.split(':').map(Number);
  const inicioMinutos = hora * 60 + minuto;

  for (const q of quadras) {
    quadraDisponivel[q] = inicioMinutos;
  }

  const totalMinutos = (duracaoMin + intervalMin);

  for (const confronto of confrontos) {
    const idA = confronto.equipe_a.id;
    const idB = confronto.equipe_b.id;

    if (!equipeDisponivel[idA]) equipeDisponivel[idA] = inicioMinutos;
    if (!equipeDisponivel[idB]) equipeDisponivel[idB] = inicioMinutos;

    // Encontra o menor slot disponível que sirva para ambas equipes e alguma quadra
    let melhorSlot = null;

    for (const quadra of quadras) {
      const slotMin = Math.max(
        quadraDisponivel[quadra],
        equipeDisponivel[idA],
        equipeDisponivel[idB]
      );

      if (!melhorSlot || slotMin < melhorSlot.slotMin) {
        melhorSlot = { slotMin, quadra };
      }
    }

    const { slotMin, quadra } = melhorSlot;
    const fimMin = slotMin + duracaoMin;

    // Atualiza disponibilidades
    quadraDisponivel[quadra] = fimMin + intervalMin;
    equipeDisponivel[idA] = fimMin + intervalMin;
    equipeDisponivel[idB] = fimMin + intervalMin;

    // Converte slotMin para data_hora
    const dataBase = new Date(dataInicio);
    dataBase.setHours(Math.floor(slotMin / 60), slotMin % 60, 0, 0);

    resultado.push({
      ...confronto,
      quadra,
      data_hora: dataBase.toISOString().slice(0, 19).replace('T', ' '),
    });
  }

  return resultado;
}

// ════════════════════════════════════════
// RANKING — por modalidade
// ════════════════════════════════════════

export async function calcularRanking(eventoId, modalidadeId, categoria) {
  const conexao = await conectar();
  try {
    const [jogos] = await conexao.query(
      `SELECT j.*, 
        ea.nome as equipe_a_nome, eb.nome as equipe_b_nome,
        s.placar_a, s.placar_b, s.sets_a, s.sets_b, s.vencedor_equipe_id,
        m.tipo as modalidade_tipo
       FROM jogos j
       JOIN equipes ea ON ea.id = j.equipe_a_id
       JOIN equipes eb ON eb.id = j.equipe_b_id
       LEFT JOIN sumulas s ON s.jogo_id = j.id AND s.finalizada = 1
       LEFT JOIN modalidades m ON m.id = j.modalidade_id
       WHERE j.evento_id = ? AND j.modalidade_id = ? AND j.categoria = ? AND j.fase = 'GRUPOS'`,
      [eventoId, modalidadeId, categoria]
    );

    const [equipes] = await conexao.query(
      `SELECT DISTINCT e.id, e.nome, e.chave FROM jogos j
       JOIN equipes e ON e.id = j.equipe_a_id OR e.id = j.equipe_b_id
       WHERE j.evento_id = ? AND j.modalidade_id = ? AND j.categoria = ?`,
      [eventoId, modalidadeId, categoria]
    );

    const stats = {};
    for (const eq of equipes) {
      stats[eq.id] = {
        id: eq.id, nome: eq.nome, chave: eq.chave,
        pontos: 0, vitorias: 0, derrotas: 0, empates: 0,
        gols_pro: 0, gols_contra: 0, saldo_gols: 0,
        pts_pro: 0, pts_contra: 0, saldo_pts: 0,
        sets_pro: 0, sets_contra: 0,
        jogos: 0,
      };
    }

    for (const jogo of jogos) {
      if (!jogo.vencedor_equipe_id && jogo.placar_a === null) continue;
      const a = stats[jogo.equipe_a_id];
      const b = stats[jogo.equipe_b_id];
      if (!a || !b) continue;

      a.jogos++;
      b.jogos++;

      const tipo = (jogo.modalidade_tipo || '').toLowerCase();
      const placarA = Number(jogo.placar_a || 0);
      const placarB = Number(jogo.placar_b || 0);
      const vencedor = jogo.vencedor_equipe_id;

      if (tipo === 'basquete') {
        a.pts_pro += placarA; a.pts_contra += placarB;
        b.pts_pro += placarB; b.pts_contra += placarA;
        a.saldo_pts = a.pts_pro - a.pts_contra;
        b.saldo_pts = b.pts_pro - b.pts_contra;
      } else if (['futsal', 'handebol', 'futebol'].includes(tipo)) {
        a.gols_pro += placarA; a.gols_contra += placarB;
        b.gols_pro += placarB; b.gols_contra += placarA;
        a.saldo_gols = a.gols_pro - a.gols_contra;
        b.saldo_gols = b.gols_pro - b.gols_contra;
      } else if (tipo.includes('volei') || tipo.includes('vôlei')) {
        const setsA = Number(jogo.sets_a || 0);
        const setsB = Number(jogo.sets_b || 0);
        a.sets_pro += setsA; a.sets_contra += setsB;
        b.sets_pro += setsB; b.sets_contra += setsA;
        a.pts_pro += placarA; a.pts_contra += placarB;
        b.pts_pro += placarB; b.pts_contra += placarA;
      }

      if (vencedor === jogo.equipe_a_id) {
        a.pontos += 3; a.vitorias++;
        b.derrotas++;
      } else if (vencedor === jogo.equipe_b_id) {
        b.pontos += 3; b.vitorias++;
        a.derrotas++;
      } else if (placarA === placarB) {
        a.pontos += 1; b.pontos += 1;
        a.empates++; b.empates++;
      }
    }

    // Ordenação por chave
    const porChave = {};
    for (const eq of Object.values(stats)) {
      if (!porChave[eq.chave]) porChave[eq.chave] = [];
      porChave[eq.chave].push(eq);
    }

    for (const chave in porChave) {
      porChave[chave].sort(compararEquipes);
      porChave[chave].forEach((eq, i) => { eq.posicao_chave = i + 1; });
    }

    return { ranking: Object.values(stats), porChave };
  } finally {
    await conexao.end();
  }
}

function compararEquipes(a, b) {
  if (b.pontos !== a.pontos) return b.pontos - a.pontos;
  if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
  const saldoA = (a.saldo_gols || 0) + (a.saldo_pts || 0);
  const saldoB = (b.saldo_gols || 0) + (b.saldo_pts || 0);
  if (saldoB !== saldoA) return saldoB - saldoA;
  return (b.gols_pro || b.pts_pro || 0) - (a.gols_pro || a.pts_pro || 0);
}

// ════════════════════════════════════════
// CLASSIFICAÇÃO PARA MATA-MATA
// ════════════════════════════════════════

export function selecionarClassificados(porChave) {
  const primeirosPorChave = [];
  const segundosPorChave = [];

  for (const [nomeChave, equipes] of Object.entries(porChave)) {
    if (equipes.length >= 1) primeirosPorChave.push({ ...equipes[0], chave: nomeChave });
    if (equipes.length >= 2) segundosPorChave.push({ ...equipes[1], chave: nomeChave });
  }

  const vagasRestantes = 8 - primeirosPorChave.length;
  const melhoresSegundos = [...segundosPorChave]
    .sort(compararEquipes)
    .slice(0, Math.max(0, vagasRestantes));

  return [...primeirosPorChave, ...melhoresSegundos].slice(0, 8);
}

// ════════════════════════════════════════
// MATA-MATA — geração das quartas
// ════════════════════════════════════════

export async function gerarMataMataJICS({ eventoId, modalidadeId, categoria, classificados, quadras, dataInicio, horaInicio = '08:00', duracaoMin = 40, intervalMin = 20 }) {
  if (classificados.length < 2) throw new Error('Mínimo de 2 classificados para mata-mata.');

  const emparelhamentos = emparelharQuartas(classificados);
  const confrontos = emparelhamentos.map((par, i) => ({
    chave: 'MATA-MATA',
    equipe_a: par[0],
    equipe_b: par[1],
    fase: par.fase || 'QUARTAS',
    numero_jogo: i + 1,
  }));

  const agendados = atribuirHorarios(confrontos, quadras || ['Quadra A'], dataInicio, horaInicio, duracaoMin, intervalMin);

  const conexao = await conectar();
  try {
    const salvoIds = [];
    for (const jogo of agendados) {
      const [res] = await conexao.query(
        `INSERT INTO jogos (evento_id, modalidade_id, categoria, equipe_a_id, equipe_b_id, chave, quadra, data_hora, fase, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENDADO')`,
        [eventoId, modalidadeId, categoria, jogo.equipe_a.id, jogo.equipe_b.id, 'MATA-MATA', jogo.quadra, jogo.data_hora, jogo.fase]
      );
      salvoIds.push(res.insertId);
    }
    return { jogos: agendados, ids: salvoIds };
  } finally {
    await conexao.end();
  }
}

function emparelharQuartas(classificados) {
  // 1×8, 4×5, 2×7, 3×6
  const pares = [
    [classificados[0], classificados[7]],
    [classificados[3], classificados[4]],
    [classificados[1], classificados[6]],
    [classificados[2], classificados[5]],
  ].filter(p => p[0] && p[1]);

  return pares.map(p => Object.assign(p, { fase: 'QUARTAS' }));
}

// ════════════════════════════════════════
// BOLETIM OFICIAL — CRUD
// ════════════════════════════════════════

export async function listarBoletins({ page = 1, size = 20, search = '', tipo = '' } = {}) {
  const offset = (page - 1) * size;
  let where = 'WHERE 1=1';
  const params = [];
  if (search) { where += ' AND (titulo LIKE ? OR descricao LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (tipo) { where += ' AND tipo = ?'; params.push(tipo); }
  const [rows] = await dbQuery(`SELECT * FROM boletins ${where} ORDER BY data_publicacao DESC LIMIT ? OFFSET ?`, [...params, size, offset]);
  const [[{ total }]] = await dbQuery(`SELECT COUNT(*) as total FROM boletins ${where}`, params);
  return { boletins: rows, total, page, size };
}

export async function criarBoletim({ titulo, descricao, tipo = 'GERAL', data_publicacao, pdf_path = null, publicado = true }) {
  const [res] = await dbQuery(
    `INSERT INTO boletins (titulo, descricao, tipo, data_publicacao, pdf_path, publicado) VALUES (?, ?, ?, ?, ?, ?)`,
    [titulo, descricao, tipo, data_publicacao || new Date(), pdf_path, publicado ? 1 : 0]
  );
  return res.insertId;
}

export async function atualizarBoletim(id, dados) {
  const campos = [];
  const vals = [];
  for (const [k, v] of Object.entries(dados)) {
    campos.push(`${k} = ?`);
    vals.push(v);
  }
  if (!campos.length) return;
  vals.push(id);
  await dbQuery(`UPDATE boletins SET ${campos.join(', ')} WHERE id = ?`, vals);
}

export async function deletarBoletim(id) {
  await dbQuery('DELETE FROM boletins WHERE id = ?', [id]);
}

// ════════════════════════════════════════
// SCHEMA — garante tabelas do JICS
// ════════════════════════════════════════

export async function ensureJICSSchema() {
  const conexao = await conectar();
  try {
    // Turmas fixas
    await conexao.query(`
      CREATE TABLE IF NOT EXISTS turmas_jics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        curso VARCHAR(60) NOT NULL,
        serie VARCHAR(10) NOT NULL,
        letra VARCHAR(5) NOT NULL,
        nome VARCHAR(100) NOT NULL,
        UNIQUE KEY uq_turma (curso, serie, letra)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Garante as 24 turmas
    for (const t of TURMAS_FIXAS) {
      await conexao.query(
        `INSERT IGNORE INTO turmas_jics (id, curso, serie, letra, nome) VALUES (?, ?, ?, ?, ?)`,
        [t.id, t.curso, t.serie, t.letra, t.nome]
      );
    }

    // Equipes
    await conexao.query(`
      CREATE TABLE IF NOT EXISTS equipes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(120) NOT NULL,
        turma_id INT NOT NULL,
        modalidade_id INT NOT NULL,
        categoria VARCHAR(20) NOT NULL DEFAULT 'MASCULINO',
        evento_id BIGINT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_equipe (turma_id, modalidade_id, categoria, evento_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Equipe_atletas (many-to-many)
    await conexao.query(`
      CREATE TABLE IF NOT EXISTS equipe_atletas (
        equipe_id INT NOT NULL,
        aluno_id INT NOT NULL,
        numero_camisa INT NULL,
        PRIMARY KEY (equipe_id, aluno_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Garante colunas extras em jogos
    const [jogosCols] = await conexao.query("SHOW TABLES LIKE 'jogos'");
    if (jogosCols.length) {
      const [cols] = await conexao.query('SHOW COLUMNS FROM jogos');
      const colSet = new Set(cols.map(c => c.Field));
      if (!colSet.has('chave')) await conexao.query("ALTER TABLE jogos ADD COLUMN chave VARCHAR(5) NULL");
      if (!colSet.has('placar_a')) await conexao.query("ALTER TABLE jogos ADD COLUMN placar_a INT NULL");
      if (!colSet.has('placar_b')) await conexao.query("ALTER TABLE jogos ADD COLUMN placar_b INT NULL");
      if (!colSet.has('equipe_a_id')) await conexao.query("ALTER TABLE jogos ADD COLUMN equipe_a_id INT NULL");
      if (!colSet.has('equipe_b_id')) await conexao.query("ALTER TABLE jogos ADD COLUMN equipe_b_id INT NULL");
    }

    // Súmulas
    await conexao.query(`
      CREATE TABLE IF NOT EXISTS sumulas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        jogo_id INT NOT NULL,
        placar_a INT DEFAULT 0,
        placar_b INT DEFAULT 0,
        sets_a INT DEFAULT 0,
        sets_b INT DEFAULT 0,
        vencedor_equipe_id INT NULL,
        finalizada TINYINT(1) DEFAULT 0,
        finalizado_por VARCHAR(30) NULL,
        data_fim DATETIME NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Eventos das súmulas
    await conexao.query(`
      CREATE TABLE IF NOT EXISTS sumulas_eventos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sumula_id INT NOT NULL,
        jogo_id INT NOT NULL,
        equipe_id INT NOT NULL,
        atleta_id INT NOT NULL,
        tipo_evento VARCHAR(40) NOT NULL,
        periodo VARCHAR(20) NULL,
        tempo VARCHAR(10) NULL,
        quantidade INT DEFAULT 1,
        observacao TEXT NULL,
        user_id INT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Boletins Oficiais
    await conexao.query(`
      CREATE TABLE IF NOT EXISTS boletins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(200) NOT NULL,
        descricao TEXT NULL,
        tipo VARCHAR(30) DEFAULT 'GERAL',
        data_publicacao DATE NOT NULL,
        pdf_path VARCHAR(255) NULL,
        publicado TINYINT(1) DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Configuração de locais/quadras
    await conexao.query(`
      CREATE TABLE IF NOT EXISTS locais_jogo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(60) NOT NULL,
        tipo VARCHAR(30) DEFAULT 'QUADRA',
        ativo TINYINT(1) DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Locais padrão
    const locaisPadrao = [
      ['Quadra A', 'QUADRA'],
      ['Quadra B', 'QUADRA'],
      ['Quadra de Areia', 'AREIA'],
      ['Campo', 'CAMPO'],
    ];
    for (const [nome, tipo] of locaisPadrao) {
      await conexao.query(`INSERT IGNORE INTO locais_jogo (nome, tipo) VALUES (?, ?)`, [nome, tipo]);
    }

    console.log('[JICS] Schema garantido com sucesso.');
  } finally {
    await conexao.end();
  }
}
