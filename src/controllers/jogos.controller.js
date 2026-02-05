import { registrarLog } from '../utils/logger.js';
import { emitJogosAtualizados } from '../utils/socket.js';
import { atualizarStatusJogo, atualizarPlacarJogo, buscarJogoPorId } from '../services/jogos.service.js';

function jsonErro(res, status, mensagem, detalhes) {
  return res.status(status).json({ sucesso: false, erro: { mensagem, detalhes } });
}

function jsonOk(res, data) {
  return res.json({ sucesso: true, data });
}

const STATUS_VALIDOS = new Set(['NAO_INICIADO', 'EM_ANDAMENTO', 'FINALIZADO']);

export async function atualizarStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body || {};
  if (!STATUS_VALIDOS.has(String(status || '').toUpperCase())) {
    return jsonErro(res, 400, 'Status invalido.');
  }

  const statusNorm = String(status).toUpperCase();
  const affected = await atualizarStatusJogo({
    id,
    organization_id: req.organizationId,
    status: statusNorm,
  });

  if (!affected) return jsonErro(res, 404, 'Jogo nao encontrado.');

  const jogo = await buscarJogoPorId({ id, organization_id: req.organizationId });
  if (jogo?.evento_id) {
    await emitJogosAtualizados(req, jogo.evento_id);
  }

  await registrarLog({
    req,
    admin: req.admin,
    acao: 'UPDATE',
    entidade: 'jogo_status',
    entidade_id: id,
  });

  return jsonOk(res, { id, status: statusNorm });
}

export async function atualizarPlacar(req, res) {
  const { id } = req.params;
  const { placar_a, placar_b, status } = req.body || {};

  if (placar_a == null || placar_b == null) {
    return jsonErro(res, 400, 'Placar incompleto.');
  }

  const statusNorm = STATUS_VALIDOS.has(String(status || '').toUpperCase())
    ? String(status).toUpperCase()
    : 'FINALIZADO';

  const affected = await atualizarPlacarJogo({
    id,
    organization_id: req.organizationId,
    placar_a: Number(placar_a),
    placar_b: Number(placar_b),
    status: statusNorm,
  });

  if (!affected) return jsonErro(res, 404, 'Jogo nao encontrado.');

  const jogo = await buscarJogoPorId({ id, organization_id: req.organizationId });
  if (jogo?.evento_id) {
    await emitJogosAtualizados(req, jogo.evento_id);
  }

  await registrarLog({
    req,
    admin: req.admin,
    acao: 'UPDATE',
    entidade: 'jogo_placar',
    entidade_id: id,
  });

  return jsonOk(res, { id, placar_a, placar_b, status: statusNorm });
}
