/**
 * JICS Routes — Equipes, Chaveamento, Súmulas, Boletins
 */
import { Router } from 'express';
import { attachAdminToReq, requireAuth, requireOrg } from '../middlewares/auth.js';
import {
  TURMAS_FIXAS,
  criarEquipeSeNaoExistir,
  gerarChaveamentoJICS,
  calcularRanking,
  selecionarClassificados,
  gerarMataMataJICS,
  listarBoletins,
  criarBoletim,
  atualizarBoletim,
  deletarBoletim,
} from '../services/jics.service.js';
import { conectar } from '../../testeConexao.js';
import { dbQuery } from '../db/conn.js';

const router = Router();

// Auth para todas as rotas
router.use(attachAdminToReq, requireAuth);

// ════════════════════════════════
// TURMAS FIXAS (público para líder)
// ════════════════════════════════
router.get('/turmas', (_req, res) => {
  res.json({ sucesso: true, turmas: TURMAS_FIXAS });
});

// ════════════════════════════════
// EQUIPES
// ════════════════════════════════
router.get('/equipes', async (req, res) => {
  try {
    const { eventoId, modalidadeId, categoria } = req.query;
    let sql = `SELECT e.*, t.nome as turma_nome, m.titulo as modalidade_nome
               FROM equipes e
               LEFT JOIN turmas_jics t ON t.id = e.turma_id
               LEFT JOIN modalidades m ON m.id = e.modalidade_id
               WHERE 1=1`;
    const params = [];
    if (eventoId) { sql += ' AND e.evento_id = ?'; params.push(eventoId); }
    if (modalidadeId) { sql += ' AND e.modalidade_id = ?'; params.push(modalidadeId); }
    if (categoria) { sql += ' AND e.categoria = ?'; params.push(categoria); }
    const rows = await dbQuery(sql, params);
    res.json({ sucesso: true, equipes: rows });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/equipes', async (req, res) => {
  try {
    const { turmaId, modalidadeId, categoria, eventoId } = req.body;
    if (!turmaId || !modalidadeId || !categoria) {
      return res.status(400).json({ sucesso: false, erro: 'turmaId, modalidadeId e categoria são obrigatórios.' });
    }
    const equipeId = await criarEquipeSeNaoExistir(turmaId, modalidadeId, categoria, eventoId);
    res.json({ sucesso: true, equipeId });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// Atletas de uma equipe
router.get('/equipes/:equipeId/atletas', async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT ea.*, a.nome, a.matricula FROM equipe_atletas ea
       JOIN alunos a ON a.id = ea.aluno_id
       WHERE ea.equipe_id = ?`,
      [req.params.equipeId]
    );
    res.json({ sucesso: true, atletas: rows });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/equipes/:equipeId/atletas', async (req, res) => {
  try {
    const { alunoId, numeroCamisa } = req.body;
    await dbQuery(
      `INSERT IGNORE INTO equipe_atletas (equipe_id, aluno_id, numero_camisa) VALUES (?, ?, ?)`,
      [req.params.equipeId, alunoId, numeroCamisa || null]
    );
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.delete('/equipes/:equipeId/atletas/:alunoId', async (req, res) => {
  try {
    await dbQuery('DELETE FROM equipe_atletas WHERE equipe_id = ? AND aluno_id = ?', [req.params.equipeId, req.params.alunoId]);
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ════════════════════════════════
// CHAVEAMENTO
// ════════════════════════════════
router.post('/chaveamento/gerar', async (req, res) => {
  try {
    const { eventoId, modalidadeId, categoria, quadras, dataInicio, horaInicio, duracaoMin, intervalMin } = req.body;
    if (!eventoId || !modalidadeId || !categoria) {
      return res.status(400).json({ sucesso: false, erro: 'eventoId, modalidadeId e categoria obrigatórios.' });
    }
    const resultado = await gerarChaveamentoJICS({ eventoId, modalidadeId, categoria, quadras, dataInicio: dataInicio || new Date().toISOString(), horaInicio, duracaoMin, intervalMin });
    res.json({ sucesso: true, ...resultado });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/chaveamento/mata-mata', async (req, res) => {
  try {
    const { eventoId, modalidadeId, categoria, quadras, dataInicio, horaInicio, duracaoMin, intervalMin } = req.body;
    const { porChave } = await calcularRanking(eventoId, modalidadeId, categoria);
    const classificados = selecionarClassificados(porChave);
    const resultado = await gerarMataMataJICS({ eventoId, modalidadeId, categoria, classificados, quadras, dataInicio, horaInicio, duracaoMin, intervalMin });
    res.json({ sucesso: true, classificados, ...resultado });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ════════════════════════════════
// JOGOS
// ════════════════════════════════
router.get('/jogos', async (req, res) => {
  try {
    const { eventoId, modalidadeId, categoria, fase, chave } = req.query;
    let sql = `SELECT j.*,
      ea.nome as equipe_a_nome, eb.nome as equipe_b_nome,
      m.titulo as modalidade_nome,
      s.placar_a, s.placar_b, s.finalizada, s.id as sumula_id
      FROM jogos j
      LEFT JOIN equipes ea ON ea.id = j.equipe_a_id
      LEFT JOIN equipes eb ON eb.id = j.equipe_b_id
      LEFT JOIN modalidades m ON m.id = j.modalidade_id
      LEFT JOIN sumulas s ON s.jogo_id = j.id
      WHERE 1=1`;
    const params = [];
    if (eventoId) { sql += ' AND j.evento_id = ?'; params.push(eventoId); }
    if (modalidadeId) { sql += ' AND j.modalidade_id = ?'; params.push(modalidadeId); }
    if (categoria) { sql += ' AND j.categoria = ?'; params.push(categoria); }
    if (fase) { sql += ' AND j.fase = ?'; params.push(fase); }
    if (chave) { sql += ' AND j.chave = ?'; params.push(chave); }
    sql += ' ORDER BY j.data_hora ASC';
    const rows = await dbQuery(sql, params);
    res.json({ sucesso: true, jogos: rows });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.get('/jogos/:jogoId', async (req, res) => {
  try {
    const [jogo] = await dbQuery(
      `SELECT j.*, ea.nome as equipe_a_nome, eb.nome as equipe_b_nome, m.titulo as modalidade_nome, m.tipo as modalidade_tipo
       FROM jogos j
       LEFT JOIN equipes ea ON ea.id = j.equipe_a_id
       LEFT JOIN equipes eb ON eb.id = j.equipe_b_id
       LEFT JOIN modalidades m ON m.id = j.modalidade_id
       WHERE j.id = ?`,
      [req.params.jogoId]
    );
    if (!jogo) return res.status(404).json({ sucesso: false, erro: 'Jogo não encontrado.' });

    // Carrega atletas das equipes
    const atletasA = await dbQuery(
      `SELECT ea.*, a.nome, a.matricula FROM equipe_atletas ea JOIN alunos a ON a.id = ea.aluno_id WHERE ea.equipe_id = ?`,
      [jogo.equipe_a_id]
    );
    const atletasB = await dbQuery(
      `SELECT ea.*, a.nome, a.matricula FROM equipe_atletas ea JOIN alunos a ON a.id = ea.aluno_id WHERE ea.equipe_id = ?`,
      [jogo.equipe_b_id]
    );

    const [sumula] = await dbQuery('SELECT * FROM sumulas WHERE jogo_id = ? LIMIT 1', [jogo.id]);

    res.json({ sucesso: true, jogo, atletasA, atletasB, sumula: sumula || null });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ════════════════════════════════
// SÚMULAS
// ════════════════════════════════
router.post('/sumulas/:jogoId/iniciar', async (req, res) => {
  try {
    const { jogoId } = req.params;
    const [existing] = await dbQuery('SELECT id FROM sumulas WHERE jogo_id = ?', [jogoId]);
    if (existing) return res.json({ sucesso: true, sumulaId: existing.id, nova: false });

    const [result] = await dbQuery('INSERT INTO sumulas (jogo_id) VALUES (?)', [jogoId]);
    await dbQuery("UPDATE jogos SET status = 'EM_ANDAMENTO' WHERE id = ?", [jogoId]);
    res.json({ sucesso: true, sumulaId: result.insertId, nova: true });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/sumulas/:jogoId/evento', async (req, res) => {
  try {
    const { jogoId } = req.params;
    const { equipeId, atletaId, tipoEvento, periodo, tempo, quantidade, observacao } = req.body;

    if (!equipeId || !atletaId || !tipoEvento) {
      return res.status(400).json({ sucesso: false, erro: 'equipeId, atletaId e tipoEvento são obrigatórios.' });
    }

    const [sumula] = await dbQuery('SELECT id FROM sumulas WHERE jogo_id = ? AND finalizada = 0 LIMIT 1', [jogoId]);
    if (!sumula) return res.status(404).json({ sucesso: false, erro: 'Súmula não encontrada ou já finalizada.' });

    await dbQuery(
      `INSERT INTO sumulas_eventos (sumula_id, jogo_id, equipe_id, atleta_id, tipo_evento, periodo, tempo, quantidade, observacao, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sumula.id, jogoId, equipeId, atletaId, tipoEvento, periodo || null, tempo || null, quantidade || 1, observacao || null, req.admin?.id || null]
    );

    // Recalcula placar
    await recalcularPlacar(sumula.id, jogoId);

    // Retorna placar atualizado
    const [s] = await dbQuery('SELECT placar_a, placar_b FROM sumulas WHERE id = ?', [sumula.id]);
    const io = req.app.get('io');
    if (io) io.to(`jogo:${jogoId}`).emit('placar_update', s);

    res.json({ sucesso: true, placar: s });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.delete('/sumulas/:jogoId/evento/:eventoId', async (req, res) => {
  try {
    await dbQuery('DELETE FROM sumulas_eventos WHERE id = ? AND jogo_id = ?', [req.params.eventoId, req.params.jogoId]);
    const [sumula] = await dbQuery('SELECT id FROM sumulas WHERE jogo_id = ?', [req.params.jogoId]);
    if (sumula) await recalcularPlacar(sumula.id, req.params.jogoId);
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/sumulas/:jogoId/finalizar', async (req, res) => {
  try {
    const { jogoId } = req.params;
    const { vencedorEquipeId } = req.body;

    const [sumula] = await dbQuery('SELECT * FROM sumulas WHERE jogo_id = ? LIMIT 1', [jogoId]);
    if (!sumula) return res.status(404).json({ sucesso: false, erro: 'Súmula não encontrada.' });
    if (sumula.finalizada) return res.status(400).json({ sucesso: false, erro: 'Súmula já finalizada.' });

    // Determina vencedor se não informado
    let venc = vencedorEquipeId || null;
    if (!venc) {
      const jogo = (await dbQuery('SELECT equipe_a_id, equipe_b_id FROM jogos WHERE id = ?', [jogoId]))[0];
      if (sumula.placar_a > sumula.placar_b) venc = jogo.equipe_a_id;
      else if (sumula.placar_b > sumula.placar_a) venc = jogo.equipe_b_id;
    }

    await dbQuery(
      `UPDATE sumulas SET finalizada = 1, vencedor_equipe_id = ?, data_fim = NOW(), finalizado_por = ? WHERE id = ?`,
      [venc, req.admin?.nome || 'sistema', sumula.id]
    );
    await dbQuery("UPDATE jogos SET status = 'FINALIZADO' WHERE id = ?", [jogoId]);

    // Atualiza chaveamento se for mata-mata
    await avancarChaveamento(jogoId, venc);

    const io = req.app.get('io');
    if (io) io.to(`jogo:${jogoId}`).emit('jogo_finalizado', { jogoId, vencedorEquipeId: venc });

    res.json({ sucesso: true, vencedorEquipeId: venc });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ════════════════════════════════
// RANKING
// ════════════════════════════════
router.get('/ranking', async (req, res) => {
  try {
    const { eventoId, modalidadeId, categoria } = req.query;
    const resultado = await calcularRanking(eventoId, modalidadeId, categoria);
    res.json({ sucesso: true, ...resultado });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ════════════════════════════════
// BOLETIM OFICIAL
// ════════════════════════════════
router.get('/boletim', async (req, res) => {
  try {
    const { page, size, search, tipo } = req.query;
    const resultado = await listarBoletins({ page, size, search, tipo });
    res.json({ sucesso: true, ...resultado });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/boletim', async (req, res) => {
  try {
    const { titulo, descricao, tipo, data_publicacao, publicado } = req.body;
    if (!titulo) return res.status(400).json({ sucesso: false, erro: 'Título obrigatório.' });
    const id = await criarBoletim({ titulo, descricao, tipo, data_publicacao, publicado });
    res.json({ sucesso: true, id });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.put('/boletim/:id', async (req, res) => {
  try {
    await atualizarBoletim(req.params.id, req.body);
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.delete('/boletim/:id', async (req, res) => {
  try {
    await deletarBoletim(req.params.id);
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ════════════════════════════════
// LOCAIS/QUADRAS
// ════════════════════════════════
router.get('/locais', async (_req, res) => {
  try {
    const rows = await dbQuery('SELECT * FROM locais_jogo WHERE ativo = 1 ORDER BY nome');
    res.json({ sucesso: true, locais: rows });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ════════════════════════════════
// HELPERS INTERNOS
// ════════════════════════════════
async function recalcularPlacar(sumulaId, jogoId) {
  const [jogo] = await dbQuery('SELECT equipe_a_id, equipe_b_id FROM jogos WHERE id = ?', [jogoId]);
  if (!jogo) return;

  const eventos = await dbQuery(
    'SELECT equipe_id, tipo_evento, quantidade FROM sumulas_eventos WHERE sumula_id = ?',
    [sumulaId]
  );

  let placarA = 0, placarB = 0, setsA = 0, setsB = 0;

  for (const ev of eventos) {
    const isA = ev.equipe_id == jogo.equipe_a_id;
    const q = Number(ev.quantidade || 1);
    const tipo = (ev.tipo_evento || '').toLowerCase();

    if (tipo.includes('gol') || tipo.includes('ponto') || tipo === 'cesta_1') {
      if (isA) placarA += q; else placarB += q;
    } else if (tipo === 'cesta_2') {
      if (isA) placarA += 2 * q; else placarB += 2 * q;
    } else if (tipo === 'cesta_3') {
      if (isA) placarA += 3 * q; else placarB += 3 * q;
    } else if (tipo === 'set_vencido') {
      if (isA) setsA += q; else setsB += q;
    }
  }

  await dbQuery(
    'UPDATE sumulas SET placar_a = ?, placar_b = ?, sets_a = ?, sets_b = ? WHERE id = ?',
    [placarA, placarB, setsA, setsB, sumulaId]
  );
}

async function avancarChaveamento(jogoId, vencedorEquipeId) {
  if (!vencedorEquipeId) return;
  // Encontra próximo jogo configurado com "depende_jogo_id"
  const proximo = await dbQuery(
    `SELECT id, equipe_a_id, equipe_b_id FROM jogos WHERE equipe_a_depends_jogo = ? OR equipe_b_depends_jogo = ?`,
    [jogoId, jogoId]
  );
  for (const p of proximo) {
    if (p.equipe_a_depends_jogo == jogoId) {
      await dbQuery('UPDATE jogos SET equipe_a_id = ? WHERE id = ?', [vencedorEquipeId, p.id]);
    } else {
      await dbQuery('UPDATE jogos SET equipe_b_id = ? WHERE id = ?', [vencedorEquipeId, p.id]);
    }
  }
}

export default router;
