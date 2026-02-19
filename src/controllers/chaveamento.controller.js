import { bootstrapTournament, closeCurrentStageAndAdvance, buildOverview } from '../services/advancement.service.js';
import { dbQuery } from '../db/conn.js';
import { emitJogosAtualizados } from '../utils/socket.js';

function ok(res, data) {
  return res.json({ sucesso: true, data });
}

function erro(res, status, mensagem) {
  return res.status(status).json({ sucesso: false, erro: { mensagem } });
}

async function resolveEventoId(req) {
  const explicit = Number(req.body?.evento_id || req.query?.evento_id || 0);
  if (explicit) return explicit;

  const orgId = req.organizationId;
  if (!orgId) return null;

  const preferred = await dbQuery(
    `SELECT id
     FROM eventos
     WHERE organization_id = :orgId
       AND status IN ('ABERTO', 'EM_ANDAMENTO')
     ORDER BY FIELD(status, 'EM_ANDAMENTO', 'ABERTO'), ano DESC, id DESC
     LIMIT 1`,
    { orgId }
  );
  if (preferred.length) return Number(preferred[0].id);

  const fallback = await dbQuery(
    `SELECT id
     FROM eventos
     WHERE organization_id = :orgId
     ORDER BY ano DESC, id DESC
     LIMIT 1`,
    { orgId }
  );
  return fallback.length ? Number(fallback[0].id) : null;
}

export async function bootstrapChaveamento(req, res) {
  try {
    const modalidadeId = Number(req.params.modalidadeId || 0);
    const sexo = String(req.params.sexo || '').toUpperCase();
    if (!modalidadeId || !sexo) return erro(res, 400, 'Parametros invalidos.');
    const eventoId = await resolveEventoId(req);
    if (!eventoId) return erro(res, 400, 'Evento nao encontrado.');

    const data = await bootstrapTournament({
      organization_id: req.organizationId,
      evento_id: eventoId,
      modalidade_id: modalidadeId,
      sexo,
    });
    await emitJogosAtualizados(req, eventoId);
    return ok(res, data);
  } catch (err) {
    console.error('chaveamento.bootstrap', err);
    return erro(res, 500, err?.message || 'Falha ao gerar chaveamento.');
  }
}

export async function closeStageChaveamento(req, res) {
  try {
    const modalidadeId = Number(req.params.modalidadeId || 0);
    const sexo = String(req.params.sexo || '').toUpperCase();
    const force = String(req.query?.force || '') === '1';
    if (!modalidadeId || !sexo) return erro(res, 400, 'Parametros invalidos.');
    const eventoId = await resolveEventoId(req);
    if (!eventoId) return erro(res, 400, 'Evento nao encontrado.');

    const data = await closeCurrentStageAndAdvance({
      organization_id: req.organizationId,
      evento_id: eventoId,
      modalidade_id: modalidadeId,
      sexo,
      force,
    });
    await emitJogosAtualizados(req, eventoId);
    return ok(res, data);
  } catch (err) {
    console.error('chaveamento.close-stage', err);
    return erro(res, 500, err?.message || 'Falha ao encerrar etapa.');
  }
}

export async function overviewChaveamento(req, res) {
  try {
    const modalidadeId = Number(req.params.modalidadeId || 0);
    const sexo = String(req.params.sexo || '').toUpperCase();
    if (!modalidadeId || !sexo) return erro(res, 400, 'Parametros invalidos.');
    const eventoId = await resolveEventoId(req);
    if (!eventoId) return erro(res, 400, 'Evento nao encontrado.');

    const data = await buildOverview({
      organization_id: req.organizationId,
      evento_id: eventoId,
      modalidade_id: modalidadeId,
      sexo,
    });
    return ok(res, data);
  } catch (err) {
    console.error('chaveamento.overview', err);
    return erro(res, 500, err?.message || 'Falha ao carregar overview.');
  }
}
