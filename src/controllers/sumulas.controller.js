import { getJogoDetalhes, getStandings, saveSumula } from '../services/sumulas.service.js';
import { ensureNonNegativeInt } from '../utils/validate.js';

function jsonErro(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

export async function patchSumula(req, res) {
  const id = Number(req.params.id || 0);
  if (!id) return jsonErro(res, 400, 'ID de jogo invalido.');

  const {
    placar_a,
    placar_b,
    wo,
    observacoes,
    winner_side,
    arbitro_nome,
    mesario_nome,
    cartoes,
    jogadores,
  } = req.body || {};
  const isWo = Boolean(wo);
  let placarA = ensureNonNegativeInt(placar_a);
  let placarB = ensureNonNegativeInt(placar_b);

  if (isWo && (placarA === null || placarB === null)) {
    placarA = 1;
    placarB = 0;
  }

  if (!isWo && (placarA === null || placarB === null)) {
    return jsonErro(res, 400, 'Placar invalido.');
  }

  try {
    const { jogo, meta, advanced } = await saveSumula({
      jogoId: id,
      placarA,
      placarB,
      wo: isWo,
      observacoes,
      winner_side,
      arbitro_nome,
      mesario_nome,
      cartoes,
      jogadores,
    });

    const standings = String(meta.fase || '').toUpperCase() === 'GRUPOS'
      ? await getStandings({
          modalidadeId: meta.modalidade_id,
          sexo: meta.sexo,
          chave: meta.chave,
        })
      : [];

    return res.json({
      ok: true,
      match: jogo,
      standings,
      meta,
      advanced: advanced || undefined,
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return jsonErro(res, 404, 'Jogo nao encontrado.');
    }
    if (err.code === 'TIE_BREAK_REQUIRED') {
      return jsonErro(res, 400, 'Empate em mata-mata exige vencedor.');
    }
    console.error('sumulas.patch', err);
    return jsonErro(res, 500, 'Erro ao salvar sumula.');
  }
}

export async function getJogoDetalhesController(req, res) {
  const id = Number(req.params.id || 0);
  if (!id) return jsonErro(res, 400, 'ID de jogo invalido.');
  try {
    const data = await getJogoDetalhes({ jogoId: id });
    return res.json({
      ok: true,
      match: data.jogo,
      jogadoresA: data.jogadoresA,
      jogadoresB: data.jogadoresB,
      jogadores: {
        A: data.jogadoresA,
        B: data.jogadoresB,
      },
      cartoes: data.cartoes,
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return jsonErro(res, 404, 'Jogo nao encontrado.');
    }
    console.error('sumulas.detalhes', err);
    return jsonErro(res, 500, 'Erro ao carregar detalhes da sumula.');
  }
}

export async function getTabela(req, res) {
  const modalidadeId = Number(req.query.modalidade_id || 0);
  const sexo = String(req.query.sexo || '').trim();
  const chave = String(req.query.chave || '').trim();
  if (!modalidadeId || !sexo || !chave) {
    return jsonErro(res, 400, 'Parametros invalidos.');
  }
  try {
    const standings = await getStandings({ modalidadeId, sexo, chave });
    return res.json({ ok: true, standings });
  } catch (err) {
    console.error('sumulas.tabela', err);
    return jsonErro(res, 500, 'Erro ao carregar tabela.');
  }
}
