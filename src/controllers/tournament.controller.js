import { bootstrapTournament, closeCurrentStageAndAdvance, buildOverview } from '../services/advancement.service.js';
import { setMatchResult } from '../services/matches.service.js';
import { emitJogosAtualizados } from '../utils/socket.js';

function jsonErro(res, status, message) {
  return res.status(status).json({ sucesso: false, erro: { mensagem: message } });
}

function jsonOk(res, data) {
  return res.json({ sucesso: true, data });
}

export async function bootstrapStage(req, res) {
  try {
    const { tournamentId, modalidadeId } = req.params;
    const sexo = req.body?.sexo || req.query?.sexo;
    if (!sexo) return jsonErro(res, 400, 'Sexo obrigatorio.');
    const data = await bootstrapTournament({
      organization_id: req.organizationId,
      evento_id: Number(tournamentId),
      modalidade_id: Number(modalidadeId),
      sexo,
    });
    return jsonOk(res, data);
  } catch (err) {
    return jsonErro(res, 500, err.message || 'Falha ao gerar fase.');
  }
}

export async function closeStage(req, res) {
  try {
    const { tournamentId, modalidadeId } = req.params;
    const sexo = req.body?.sexo || req.query?.sexo;
    const force = req.query?.force === '1';
    if (!sexo) return jsonErro(res, 400, 'Sexo obrigatorio.');
    const data = await closeCurrentStageAndAdvance({
      organization_id: req.organizationId,
      evento_id: Number(tournamentId),
      modalidade_id: Number(modalidadeId),
      sexo,
      force,
    });
    await emitJogosAtualizados(req, Number(tournamentId));
    return jsonOk(res, data);
  } catch (err) {
    return jsonErro(res, 500, err.message || 'Falha ao encerrar fase.');
  }
}

export async function overview(req, res) {
  try {
    const { tournamentId, modalidadeId } = req.params;
    const sexo = req.query?.sexo || req.body?.sexo || undefined;
    const data = await buildOverview({
      organization_id: req.organizationId,
      evento_id: Number(tournamentId),
      modalidade_id: Number(modalidadeId),
      sexo,
    });
    return jsonOk(res, data);
  } catch (err) {
    return jsonErro(res, 500, err.message || 'Falha ao carregar overview.');
  }
}

export async function updateMatchResult(req, res) {
  try {
    const { matchId } = req.params;
    const { homeScore, awayScore, winner_side } = req.body || {};
    if (homeScore === undefined || awayScore === undefined) {
      return jsonErro(res, 400, 'Placar obrigatorio.');
    }
    const updated = await setMatchResult({
      matchId: Number(matchId),
      homeScore: Number(homeScore),
      awayScore: Number(awayScore),
      winnerSide: winner_side,
    });
    if (updated?.evento_id) {
      await emitJogosAtualizados(req, Number(updated.evento_id));
    }
    return jsonOk(res, updated || {});
  } catch (err) {
    return jsonErro(res, 500, err.message || 'Falha ao atualizar placar.');
  }
}
