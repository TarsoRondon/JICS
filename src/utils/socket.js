import { getTelaoPayload } from '../services/telao.service.js';

export async function emitJogosAtualizados(req, eventoId) {
  const io = req.app?.get('io');
  if (!io || !eventoId) return;
  const payload = await getTelaoPayload({
    evento_id: eventoId,
    organization_id: req.organizationId,
  });
  io.to(`evento:${eventoId}`).emit('jogos_atualizados', payload);
}

