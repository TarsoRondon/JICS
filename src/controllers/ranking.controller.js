import { obterRanking } from '../services/ranking.service.js';

function jsonErro(res, status, mensagem, detalhes) {
  return res.status(status).json({ sucesso: false, erro: { mensagem, detalhes } });
}

function jsonOk(res, data) {
  return res.json({ sucesso: true, data });
}

export async function getRanking(req, res) {
  const { eventoId, modalidadeId, sexo } = req.params;
  if (!eventoId || !modalidadeId || !sexo) {
    return jsonErro(res, 400, 'Parametros invalidos.');
  }
  const ranking = await obterRanking({
    organization_id: req.organizationId,
    evento_id: eventoId,
    modalidade_id: modalidadeId,
    sexo,
  });
  return jsonOk(res, ranking);
}

