import { getTelaoPayload } from '../services/telao.service.js';

function jsonErro(res, status, mensagem, detalhes) {
  return res.status(status).json({ sucesso: false, erro: { mensagem, detalhes } });
}

function jsonOk(res, data) {
  return res.json({ sucesso: true, data });
}

export async function getTelao(req, res) {
  const { eventoId } = req.params;
  if (!eventoId) return jsonErro(res, 400, 'Evento invalido.');
  const payload = await getTelaoPayload({ evento_id: eventoId });
  return jsonOk(res, payload);
}

