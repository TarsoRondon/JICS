import { registrarLog } from '../utils/logger.js';
import { gerarPdfSorteio } from '../utils/pdf.js';
import { emitJogosAtualizados } from '../utils/socket.js';
import {
  gerarRoundRobinTurmas,
  aplicarHorarios,
  buscarSorteio,
  salvarSorteio,
  limparSorteio,
  aplicarHorariosEmJogos,
  buscarTurmasInscritas,
  calcularRanking,
} from '../services/sorteio.service.js';
import { dbQuery } from '../db/conn.js';

function jsonErro(res, status, mensagem, detalhes) {
  return res.status(status).json({ sucesso: false, erro: { mensagem, detalhes } });
}

function jsonOk(res, data) {
  return res.json({ sucesso: true, data });
}

function handleUnexpected(res, err, mensagem = 'Erro interno no sorteio.') {
  console.error('[sorteio]', err);
  return jsonErro(
    res,
    500,
    mensagem,
    process.env.NODE_ENV === 'development' ? (err?.message || String(err)) : undefined
  );
}

export async function getSorteio(req, res) {
  try {
    const { eventoId, modalidadeId, sexo } = req.params;
    const orgId = req.organizationId;
    const result = await buscarSorteio({
      organization_id: orgId,
      evento_id: eventoId,
      modalidade_id: modalidadeId,
      sexo,
    });
    return jsonOk(res, result);
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao carregar tabela de sorteio.');
  }
}

export async function gerarSorteio(req, res) {
  try {
    const {
      evento_id,
      modalidade_id,
      sexo,
      local_jogos,
      modo,
      jogos,
    } = req.body || {};

    if (!evento_id || !sexo) {
      return jsonErro(res, 400, 'Dados obrigatorios ausentes.');
    }

    if (!modalidade_id) {
      let modalidades = [];
      try {
        modalidades = await dbQuery(
          'SELECT id, nome, titulo FROM modalidades WHERE organization_id = :organization_id',
          { organization_id: req.organizationId }
        );
      } catch (err) {
        if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
        modalidades = await dbQuery('SELECT id, nome, titulo FROM modalidades', {});
      }

      let total_modalidades = 0;
      let total_jogos = 0;
      for (const mod of modalidades) {
        const modId = mod.id;
        const turmas = await buscarTurmasInscritas({ modalidade_id: modId, sexo });
        if (turmas.length < 2) continue;
        const resultado = gerarRoundRobinTurmas(turmas);
        if (!resultado.jogos?.length) continue;
        const jogosOrdenados = aplicarHorarios(
          resultado.jogos,
          req.body.hora_inicio || '07:30',
          req.body.intervalo_min || 0
        );
        await salvarSorteio({
          organization_id: req.organizationId,
          evento_id,
          modalidade_id: modId,
          sexo,
          modo: modo || 'GRUPOS',
          local_jogos: local_jogos || 'Quadra A',
          hora_inicio: req.body.hora_inicio || '07:30',
          intervalo_min: req.body.intervalo_min || 10,
          chaves_qtd: resultado.chaves_qtd,
          jogos: jogosOrdenados,
        });
        total_modalidades += 1;
        total_jogos += jogosOrdenados.length;
      }

      if (!total_modalidades) {
        return jsonErro(res, 400, 'Nenhuma modalidade com turmas suficientes para sorteio.');
      }

      await registrarLog({
        req,
        admin: req.admin,
        acao: 'CREATE',
        entidade: 'sorteio',
        entidade_id: `${evento_id}:ALL:${sexo}`,
      });

      await emitJogosAtualizados(req, evento_id);

      return jsonOk(res, { multi: true, total_modalidades, total_jogos });
    }

    let jogosBase = jogos;
    let chaves_qtd = 1;

    if (!Array.isArray(jogosBase) || jogosBase.length === 0) {
      const turmas = await buscarTurmasInscritas({ modalidade_id, sexo });
      if (turmas.length < 2) {
        return jsonErro(res, 400, 'Numero insuficiente de turmas para sorteio.');
      }
      const resultado = gerarRoundRobinTurmas(turmas);
      if (!resultado.jogos?.length) {
        return jsonErro(res, 400, 'Nao foi possivel gerar confrontos validos. Verifique turmas duplicadas.');
      }
      jogosBase = resultado.jogos;
      chaves_qtd = resultado.chaves_qtd;
    } else {
      chaves_qtd = new Set(jogosBase.map(j => j.chave)).size || 1;
    }

    const jogosOrdenados = aplicarHorarios(jogosBase, req.body.hora_inicio || '07:30', req.body.intervalo_min || 0);

    await salvarSorteio({
      organization_id: req.organizationId,
      evento_id,
      modalidade_id,
      sexo,
      modo: modo || 'GRUPOS',
      local_jogos: local_jogos || 'Quadra A',
      hora_inicio: req.body.hora_inicio || '07:30',
      intervalo_min: req.body.intervalo_min || 10,
      chaves_qtd,
      jogos: jogosOrdenados,
    });

    const sorteioAtual = await buscarSorteio({
      organization_id: req.organizationId,
      evento_id,
      modalidade_id,
      sexo,
    });
    const jogosPersistidos = Array.isArray(sorteioAtual?.jogos) ? sorteioAtual.jogos : [];
    const chavesQtdPersistidas = Number(sorteioAtual?.meta?.chaves_qtd || chaves_qtd || 1);

    await registrarLog({
      req,
      admin: req.admin,
      acao: 'CREATE',
      entidade: 'sorteio',
      entidade_id: `${evento_id}:${modalidade_id}:${sexo}`,
    });

    await emitJogosAtualizados(req, evento_id);

    return jsonOk(res, { jogos: jogosPersistidos, chaves_qtd: chavesQtdPersistidas });
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao gerar sorteio.');
  }
}

export async function aplicarHorariosController(req, res) {
  try {
    const { evento_id, modalidade_id, sexo, hora_inicio, intervalo_min } = req.body || {};
    if (!evento_id || !modalidade_id || !sexo) {
      return jsonErro(res, 400, 'Dados obrigatorios ausentes.');
    }

    await aplicarHorariosEmJogos({
      organization_id: req.organizationId,
      evento_id,
      modalidade_id,
      sexo,
      hora_inicio: hora_inicio || '07:30',
      intervalo_min: intervalo_min || 10,
    });

    await registrarLog({
      req,
      admin: req.admin,
      acao: 'UPDATE',
      entidade: 'sorteio_horarios',
      entidade_id: `${evento_id}:${modalidade_id}:${sexo}`,
    });

    await emitJogosAtualizados(req, evento_id);

    return jsonOk(res, { ok: true });
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao aplicar horarios no sorteio.');
  }
}

export async function limparSorteioController(req, res) {
  try {
    const { evento_id, modalidade_id, sexo } = req.body || {};
    if (!evento_id || !modalidade_id || !sexo) {
      return jsonErro(res, 400, 'Dados obrigatorios ausentes.');
    }

    await limparSorteio({
      organization_id: req.organizationId,
      evento_id,
      modalidade_id,
      sexo,
    });

    await registrarLog({
      req,
      admin: req.admin,
      acao: 'DELETE',
      entidade: 'sorteio',
      entidade_id: `${evento_id}:${modalidade_id}:${sexo}`,
    });

    return jsonOk(res, { ok: true });
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao limpar sorteio.');
  }
}

export async function gerarPdfSorteioController(req, res) {
  try {
    const { eventoId, modalidadeId, sexo } = req.params;
    const orgId = req.organizationId;

    let jogosFinalizados;
    try {
      jogosFinalizados = await dbQuery(
        `SELECT * FROM jogos
         WHERE organization_id = :organization_id
           AND evento_id = :evento_id
           AND modalidade_id = :modalidade_id
           AND sexo = :sexo
           AND status = 'FINALIZADO'`,
        { organization_id: orgId, evento_id: eventoId, modalidade_id: modalidadeId, sexo }
      );
    } catch (err) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
      jogosFinalizados = await dbQuery(
        `SELECT * FROM jogos
         WHERE evento_id = :evento_id
           AND modalidade_id = :modalidade_id
           AND sexo = :sexo
           AND status = 'FINALIZADO'`,
        { evento_id: eventoId, modalidade_id: modalidadeId, sexo }
      );
    }
    const ranking = calcularRanking(jogosFinalizados);

    let evento;
    try {
      evento = (await dbQuery(
        'SELECT id, nome, ano FROM eventos WHERE id = :id AND organization_id = :orgId LIMIT 1',
        { id: eventoId, orgId }
      ))[0];
    } catch (err) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
      evento = (await dbQuery(
        'SELECT id, nome, ano FROM eventos WHERE id = :id LIMIT 1',
        { id: eventoId }
      ))[0];
    }

    const modalidade = (await dbQuery(
      'SELECT id, titulo FROM modalidades WHERE id = :id LIMIT 1',
      { id: modalidadeId }
    ))[0];

    const buffer = await gerarPdfSorteio({
      evento,
      modalidade,
      sexo,
      rankingPorChave: ranking,
    });

    await registrarLog({
      req,
      admin: req.admin,
      acao: 'EXPORT',
      entidade: 'sorteio_pdf',
      entidade_id: `${eventoId}:${modalidadeId}:${sexo}`,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=\"ranking_${eventoId}_${modalidadeId}_${sexo}.pdf\"`);
    return res.send(buffer);
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao gerar PDF do sorteio.');
  }
}
