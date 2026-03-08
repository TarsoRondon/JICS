import { registrarLog } from '../utils/logger.js';
import { gerarPdfSorteio, gerarPdfTabelaSorteio } from '../utils/pdf.js';
import { emitJogosAtualizados } from '../utils/socket.js';
import {
  gerarSorteioOficial,
  buscarSorteio,
  salvarSorteio,
  limparSorteio,
  aplicarHorariosEmJogos,
  gerarMataMataPorCruzamento,
} from '../services/sorteio.service.js';
import { dbQuery } from '../db/conn.js';

function jsonErro(res, status, mensagem, detalhes) {
  return res.status(status).json({ sucesso: false, erro: { mensagem, detalhes } });
}

function jsonOk(res, data) {
  return res.json({ sucesso: true, data });
}

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normSexo(v) {
  const raw = String(v || '').trim().toUpperCase();
  if (raw === 'M' || raw.startsWith('MASC')) return 'M';
  if (raw === 'F' || raw.startsWith('FEM')) return 'F';
  if (raw === 'X' || raw.startsWith('MIX')) return 'X';
  return raw.slice(0, 1);
}

function parseJsonIfNeeded(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function normalizeStatusLabel(status) {
  const raw = String(status || '').toUpperCase();
  if (raw === 'DONE' || raw === 'FINALIZADO' || raw === 'ENCERRADO') return 'FINALIZADO';
  if (raw === 'EM_ANDAMENTO' || raw === 'LIVE') return 'EM_ANDAMENTO';
  return 'AGENDADO';
}

function buildJogoLabel(jogo, index) {
  if (jogo?.jogo_label) return String(jogo.jogo_label);
  if (jogo?.numero_jogo != null && jogo.numero_jogo !== '') return `Jogo ${jogo.numero_jogo}`;
  if (jogo?.jogo) return String(jogo.jogo);
  return `Jogo ${index + 1}`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[;"\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows = []) {
  const header = ['Ordem', 'Jogo', 'Hora', 'Chave', 'Equipe A', 'Equipe B', 'Status', 'Placar A', 'Placar B'];
  const lines = [header.map(csvEscape).join(';')];
  rows.forEach((row, index) => {
    const line = [
      row?.ordem ?? index + 1,
      buildJogoLabel(row, index),
      row?.hora_oficial || row?.hora_texto || 'A seguir',
      row?.chave || '',
      row?.equipe_a || '',
      row?.equipe_b || '',
      normalizeStatusLabel(row?.status),
      row?.placar_a ?? '',
      row?.placar_b ?? '',
    ];
    lines.push(line.map(csvEscape).join(';'));
  });
  return `\uFEFF${lines.join('\r\n')}`;
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

function mapMataMataReason(reason) {
  const key = String(reason || '').toUpperCase();
  if (key === 'KNOCKOUT_ALREADY_EXISTS') return { status: 409, mensagem: 'Mata-mata ja foi gerado para esse contexto.' };
  if (key === 'GROUP_STAGE_EMPTY') return { status: 400, mensagem: 'Nao ha jogos de grupos para gerar o mata-mata.' };
  if (key === 'GROUP_STAGE_NOT_FINISHED') return { status: 409, mensagem: 'Ainda existem jogos de grupos pendentes.' };
  if (key === 'NOT_ENOUGH_QUALIFIED') return { status: 400, mensagem: 'Numero insuficiente de classificados para mata-mata.' };
  if (key === 'PAIRING_FAILED') return { status: 500, mensagem: 'Falha ao gerar cruzamentos do mata-mata.' };
  return { status: 500, mensagem: 'Falha ao gerar mata-mata.' };
}

export async function getSorteio(req, res) {
  try {
    const { eventoId, modalidadeId, sexo } = req.params;
    const orgId = req.organizationId;
    const result = await buscarSorteio({
      organization_id: orgId,
      evento_id: toInt(eventoId, 0),
      modalidade_id: toInt(modalidadeId, 0),
      sexo: normSexo(sexo),
    });
    return jsonOk(res, result);
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao carregar tabela de sorteio.');
  }
}

export async function listarSorteiosSalvosController(req, res) {
  try {
    const orgId = req.organizationId;
    const { evento_id, modalidade_id, sexo } = req.query || {};

    const where = ['sm.organization_id = :organization_id'];
    const params = { organization_id: orgId };
    if (evento_id) {
      where.push('sm.evento_id = :evento_id');
      params.evento_id = toInt(evento_id, 0);
    }
    if (modalidade_id) {
      where.push('sm.modalidade_id = :modalidade_id');
      params.modalidade_id = toInt(modalidade_id, 0);
    }
    if (sexo) {
      where.push('sm.sexo = :sexo');
      params.sexo = normSexo(sexo);
    }

    const rows = await dbQuery(
      `SELECT
          sm.id,
          sm.evento_id,
          sm.modalidade_id,
          sm.sexo,
          sm.modo,
          sm.local_jogos,
          sm.hora_inicio,
          sm.intervalo_min,
          sm.chaves_qtd,
          sm.criado_em,
          sm.atualizado_em,
          e.nome AS evento_nome,
          e.ano AS evento_ano,
          m.titulo AS modalidade_nome,
          (
            SELECT COUNT(*)
            FROM jogos j
            WHERE j.organization_id = sm.organization_id
              AND j.evento_id = sm.evento_id
              AND j.modalidade_id = sm.modalidade_id
              AND j.sexo = sm.sexo
          ) AS jogos_total,
          (
            SELECT COUNT(*)
            FROM jogos j
            WHERE j.organization_id = sm.organization_id
              AND j.evento_id = sm.evento_id
              AND j.modalidade_id = sm.modalidade_id
              AND j.sexo = sm.sexo
              AND UPPER(j.status) IN ('DONE', 'FINALIZADO', 'ENCERRADO', 'WO')
          ) AS jogos_finalizados,
          (
            SELECT MIN(j.id)
            FROM jogos j
            WHERE j.organization_id = sm.organization_id
              AND j.evento_id = sm.evento_id
              AND j.modalidade_id = sm.modalidade_id
              AND j.sexo = sm.sexo
          ) AS primeiro_jogo_id
       FROM sorteio_meta sm
       LEFT JOIN eventos e ON e.id = sm.evento_id
       LEFT JOIN modalidades m ON m.id = sm.modalidade_id
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(sm.atualizado_em, sm.criado_em) DESC, sm.id DESC`,
      params
    );

    return jsonOk(res, { items: rows || [] });
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao listar sorteios salvos.');
  }
}

export async function salvarSorteioController(req, res) {
  try {
    const {
      evento_id,
      modalidade_id,
      sexo,
      local_jogos,
      modo,
      jogos,
      hora_inicio,
      intervalo_min,
    } = req.body || {};

    const eventoId = toInt(evento_id, 0);
    const modalidadeId = toInt(modalidade_id, 0);
    const sexoNormalizado = normSexo(sexo);

    if (!eventoId || !modalidadeId || !sexoNormalizado) {
      return jsonErro(res, 400, 'Dados obrigatorios ausentes.');
    }

    const jogosList = Array.isArray(jogos) ? jogos : [];
    if (!jogosList.length) {
      return jsonErro(res, 400, 'Nao ha jogos para salvar.');
    }

    const chaves_qtd = new Set(
      jogosList
        .map((j) => String(j?.chave || '').trim())
        .filter(Boolean)
    ).size || 1;

    await salvarSorteio({
      organization_id: req.organizationId,
      evento_id: eventoId,
      modalidade_id: modalidadeId,
      sexo: sexoNormalizado,
      modo: modo || 'GRUPOS',
      local_jogos: local_jogos || 'Quadra A',
      hora_inicio: hora_inicio || '07:30',
      intervalo_min: toInt(intervalo_min, 10),
      chaves_qtd,
      jogos: jogosList,
      tipo_participacao: req.body?.tipo_participacao || 'COLETIVA',
      rules_json: parseJsonIfNeeded(req.body?.rules_json, null),
    });

    const sorteioAtual = await buscarSorteio({
      organization_id: req.organizationId,
      evento_id: eventoId,
      modalidade_id: modalidadeId,
      sexo: sexoNormalizado,
    });

    await registrarLog({
      req,
      admin: req.admin,
      acao: 'UPDATE',
      entidade: 'sorteio',
      entidade_id: `${eventoId}:${modalidadeId}:${sexoNormalizado}`,
    });

    await emitJogosAtualizados(req, eventoId);

    return jsonOk(res, {
      jogos: sorteioAtual?.jogos || [],
      chaves_qtd: Number(sorteioAtual?.meta?.chaves_qtd || chaves_qtd || 1),
      ranking_por_chave: sorteioAtual?.ranking_por_chave || {},
      resumo_chaves: sorteioAtual?.resumo_chaves || [],
    });
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao salvar sorteio.');
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

    const eventoId = toInt(evento_id, 0);
    const modalidadeId = toInt(modalidade_id, 0);
    const sexoNormalizado = normSexo(sexo);
    const horaInicio = req.body?.hora_inicio || '07:30';
    const intervaloMin = toInt(req.body?.intervalo_min, 10);
    const tipoParticipacao = req.body?.tipo_participacao || 'COLETIVA';
    const headTeams = Array.isArray(req.body?.head_teams) ? req.body.head_teams : [];
    const rulesJson = parseJsonIfNeeded(req.body?.rules_json, null);

    if (!eventoId || !sexoNormalizado) {
      return jsonErro(res, 400, 'Dados obrigatorios ausentes.');
    }

    if (!modalidade_id) {
      let modalidades = [];
      try {
        modalidades = await dbQuery(
          'SELECT id, nome, titulo FROM modalidades WHERE organization_id = :organization_id ORDER BY id ASC',
          { organization_id: req.organizationId }
        );
      } catch (err) {
        if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
        modalidades = await dbQuery('SELECT id, nome, titulo FROM modalidades ORDER BY id ASC', {});
      }

      let total_modalidades = 0;
      let total_jogos = 0;
      const ignoradas = [];
      for (const mod of modalidades) {
        const modId = toInt(mod.id, 0);
        if (!modId) continue;
        try {
          const gerado = await gerarSorteioOficial({
            organization_id: req.organizationId,
            evento_id: eventoId,
            modalidade_id: modId,
            sexo: sexoNormalizado,
            local_jogos: local_jogos || 'Quadra A',
            modo: modo || 'GRUPOS',
            hora_inicio: horaInicio,
            intervalo_min: intervaloMin,
            tipo_participacao: tipoParticipacao,
            head_teams: headTeams,
            rules_json: rulesJson,
          });
          total_modalidades += 1;
          total_jogos += Array.isArray(gerado?.jogos) ? gerado.jogos.length : 0;
        } catch (err) {
          if (String(err?.message || '').toLowerCase().includes('insuficiente')) {
            ignoradas.push({
              modalidade_id: modId,
              modalidade: mod.nome || mod.titulo || `Modalidade ${modId}`,
              motivo: 'Sem equipes suficientes',
            });
            continue;
          }
          throw err;
        }
      }

      if (!total_modalidades) {
        return jsonErro(res, 400, 'Nenhuma modalidade com equipes suficientes para sorteio.');
      }

      await registrarLog({
        req,
        admin: req.admin,
        acao: 'CREATE',
        entidade: 'sorteio',
        entidade_id: `${eventoId}:ALL:${sexoNormalizado}`,
      });

      await emitJogosAtualizados(req, eventoId);

      return jsonOk(res, { multi: true, total_modalidades, total_jogos, ignoradas });
    }

    if (!modalidadeId) {
      return jsonErro(res, 400, 'Modalidade invalida.');
    }

    if (Array.isArray(jogos) && jogos.length > 0) {
      const chaves_qtd = new Set(
        jogos
          .map((j) => String(j?.chave || '').trim())
          .filter(Boolean)
      ).size || 1;

      await salvarSorteio({
        organization_id: req.organizationId,
        evento_id: eventoId,
        modalidade_id: modalidadeId,
        sexo: sexoNormalizado,
        modo: modo || 'GRUPOS',
        local_jogos: local_jogos || 'Quadra A',
        hora_inicio: horaInicio,
        intervalo_min: intervaloMin,
        chaves_qtd,
        jogos,
        tipo_participacao: tipoParticipacao,
        rules_json: rulesJson,
      });
    } else {
      await gerarSorteioOficial({
        organization_id: req.organizationId,
        evento_id: eventoId,
        modalidade_id: modalidadeId,
        sexo: sexoNormalizado,
        local_jogos: local_jogos || 'Quadra A',
        modo: modo || 'GRUPOS',
        hora_inicio: horaInicio,
        intervalo_min: intervaloMin,
        tipo_participacao: tipoParticipacao,
        head_teams: headTeams,
        rules_json: rulesJson,
      });
    }

    const sorteioAtual = await buscarSorteio({
      organization_id: req.organizationId,
      evento_id: eventoId,
      modalidade_id: modalidadeId,
      sexo: sexoNormalizado,
    });

    await registrarLog({
      req,
      admin: req.admin,
      acao: 'CREATE',
      entidade: 'sorteio',
      entidade_id: `${eventoId}:${modalidadeId}:${sexoNormalizado}`,
    });

    await emitJogosAtualizados(req, eventoId);

    return jsonOk(res, {
      jogos: Array.isArray(sorteioAtual?.jogos) ? sorteioAtual.jogos : [],
      chaves_qtd: Number(sorteioAtual?.meta?.chaves_qtd || 1),
      ranking_por_chave: sorteioAtual?.ranking_por_chave || {},
      resumo_chaves: sorteioAtual?.resumo_chaves || [],
      meta: sorteioAtual?.meta || null,
    });
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao gerar sorteio.');
  }
}

export async function realizarCongressoTecnicoDigitalController(req, res) {
  return gerarSorteio(req, res);
}

export async function gerarMataMataController(req, res) {
  try {
    const {
      evento_id,
      modalidade_id,
      sexo,
      force,
      local_jogos,
      hora_inicio,
    } = req.body || {};

    const eventoId = toInt(evento_id, 0);
    const modalidadeId = toInt(modalidade_id, 0);
    const sexoNormalizado = normSexo(sexo);
    if (!eventoId || !modalidadeId || !sexoNormalizado) {
      return jsonErro(res, 400, 'Dados obrigatorios ausentes.');
    }

    const result = await gerarMataMataPorCruzamento({
      organization_id: req.organizationId,
      evento_id: eventoId,
      modalidade_id: modalidadeId,
      sexo: sexoNormalizado,
      force: Boolean(force),
      local_jogos: local_jogos || 'Quadra A',
      hora_inicio: hora_inicio || '07:30',
    });

    if (!result?.created) {
      const mapped = mapMataMataReason(result?.reason);
      return jsonErro(res, mapped.status, mapped.mensagem, result);
    }

    const sorteioAtual = await buscarSorteio({
      organization_id: req.organizationId,
      evento_id: eventoId,
      modalidade_id: modalidadeId,
      sexo: sexoNormalizado,
    });

    await registrarLog({
      req,
      admin: req.admin,
      acao: 'CREATE',
      entidade: 'mata_mata',
      entidade_id: `${eventoId}:${modalidadeId}:${sexoNormalizado}`,
    });

    await emitJogosAtualizados(req, eventoId);

    return jsonOk(res, {
      created: true,
      jogos_mata_mata: result?.jogos || [],
      ranking_por_chave: result?.ranking_por_chave || {},
      classificados: result?.qualified || [],
      jogos: sorteioAtual?.jogos || [],
      meta: sorteioAtual?.meta || null,
    });
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao gerar mata-mata.');
  }
}

export async function downloadSorteioTabelaController(req, res) {
  try {
    const { eventoId, modalidadeId, sexo } = req.params;
    const orgId = req.organizationId;
    const formato = String(req.query.formato || 'csv').toLowerCase();

    if (!['csv', 'pdf'].includes(formato)) {
      return jsonErro(res, 400, 'Formato de download invalido.');
    }

    const result = await buscarSorteio({
      organization_id: orgId,
      evento_id: toInt(eventoId, 0),
      modalidade_id: toInt(modalidadeId, 0),
      sexo: normSexo(sexo),
    });

    const jogos = Array.isArray(result?.jogos) ? result.jogos : [];
    if (formato === 'csv') {
      const csv = toCsv(jogos);
      const filename = `tabela_sorteio_evento_${eventoId}_modalidade_${modalidadeId}_${sexo}.csv`;

      await registrarLog({
        req,
        admin: req.admin,
        acao: 'EXPORT',
        entidade: 'sorteio_tabela_csv',
        entidade_id: `${eventoId}:${modalidadeId}:${sexo}`,
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    }

    let evento = null;
    try {
      evento = (await dbQuery(
        `SELECT id, nome, ano
         FROM eventos
         WHERE id = :id AND organization_id = :organization_id
         LIMIT 1`,
        { id: toInt(eventoId, 0), organization_id: orgId }
      ))[0] || null;
    } catch (err) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
      evento = (await dbQuery(
        `SELECT id, nome, ano
         FROM eventos
         WHERE id = :id
         LIMIT 1`,
        { id: toInt(eventoId, 0) }
      ))[0] || null;
    }

    const modalidade = (await dbQuery(
      `SELECT id, titulo
       FROM modalidades
       WHERE id = :id
       LIMIT 1`,
      { id: toInt(modalidadeId, 0) }
    ))[0] || null;

    const pdf = await gerarPdfTabelaSorteio({
      evento,
      modalidade,
      sexo: normSexo(sexo),
      jogos,
    });
    const filename = `tabela_sorteio_evento_${eventoId}_modalidade_${modalidadeId}_${sexo}.pdf`;

    await registrarLog({
      req,
      admin: req.admin,
      acao: 'EXPORT',
      entidade: 'sorteio_tabela_pdf',
      entidade_id: `${eventoId}:${modalidadeId}:${sexo}`,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdf);
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao baixar tabela de sorteio.');
  }
}

export async function aplicarHorariosController(req, res) {
  try {
    const { evento_id, modalidade_id, sexo, hora_inicio, intervalo_min } = req.body || {};

    const eventoId = toInt(evento_id, 0);
    const modalidadeId = toInt(modalidade_id, 0);
    const sexoNormalizado = normSexo(sexo);

    if (!eventoId || !modalidadeId || !sexoNormalizado) {
      return jsonErro(res, 400, 'Dados obrigatorios ausentes.');
    }

    await aplicarHorariosEmJogos({
      organization_id: req.organizationId,
      evento_id: eventoId,
      modalidade_id: modalidadeId,
      sexo: sexoNormalizado,
      hora_inicio: hora_inicio || '07:30',
      intervalo_min: toInt(intervalo_min, 10),
    });

    await registrarLog({
      req,
      admin: req.admin,
      acao: 'UPDATE',
      entidade: 'sorteio_horarios',
      entidade_id: `${eventoId}:${modalidadeId}:${sexoNormalizado}`,
    });

    await emitJogosAtualizados(req, eventoId);

    return jsonOk(res, { ok: true });
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao aplicar horarios no sorteio.');
  }
}

export async function limparSorteioController(req, res) {
  try {
    const { evento_id, modalidade_id, sexo } = req.body || {};
    const eventoId = toInt(evento_id, 0);
    const modalidadeId = toInt(modalidade_id, 0);
    const sexoNormalizado = normSexo(sexo);

    if (!eventoId || !modalidadeId || !sexoNormalizado) {
      return jsonErro(res, 400, 'Dados obrigatorios ausentes.');
    }

    await limparSorteio({
      organization_id: req.organizationId,
      evento_id: eventoId,
      modalidade_id: modalidadeId,
      sexo: sexoNormalizado,
    });

    await registrarLog({
      req,
      admin: req.admin,
      acao: 'DELETE',
      entidade: 'sorteio',
      entidade_id: `${eventoId}:${modalidadeId}:${sexoNormalizado}`,
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

    const sorteio = await buscarSorteio({
      organization_id: orgId,
      evento_id: toInt(eventoId, 0),
      modalidade_id: toInt(modalidadeId, 0),
      sexo: normSexo(sexo),
    });

    let evento;
    try {
      evento = (await dbQuery(
        'SELECT id, nome, ano FROM eventos WHERE id = :id AND organization_id = :orgId LIMIT 1',
        { id: toInt(eventoId, 0), orgId }
      ))[0];
    } catch (err) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
      evento = (await dbQuery(
        'SELECT id, nome, ano FROM eventos WHERE id = :id LIMIT 1',
        { id: toInt(eventoId, 0) }
      ))[0];
    }

    const modalidade = (await dbQuery(
      'SELECT id, titulo FROM modalidades WHERE id = :id LIMIT 1',
      { id: toInt(modalidadeId, 0) }
    ))[0];

    const buffer = await gerarPdfSorteio({
      evento,
      modalidade,
      sexo: normSexo(sexo),
      rankingPorChave: sorteio?.ranking_por_chave || {},
    });

    await registrarLog({
      req,
      admin: req.admin,
      acao: 'EXPORT',
      entidade: 'sorteio_pdf',
      entidade_id: `${eventoId}:${modalidadeId}:${sexo}`,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ranking_${eventoId}_${modalidadeId}_${sexo}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    return handleUnexpected(res, err, 'Falha ao gerar PDF do sorteio.');
  }
}
