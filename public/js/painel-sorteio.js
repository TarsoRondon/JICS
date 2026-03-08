(() => {
  const SUMULA_PAGE_URL = '/sumula.html';
  const state = {
    eventos: [],
    modalidades: [],
    allRows: [],
    rows: [],
  };
  const SORTEIO_LOADING_MIN_DURATION = 1200;
  let sorteioLoadingShownAt = 0;
  let sorteioLoadingTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanLabel(value) {
    return String(value ?? '')
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractMatchId(row) {
    const candidates = [
      row?.id,
      row?.jogo_id,
      row?.jogoId,
      row?.id_jogo,
      row?.match_id,
      row?.matchId,
      row?.ID,
    ];
    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }

  function normalizeStatus(status) {
    const raw = String(status || '').toLowerCase();
    if (raw === 'done' || raw === 'finalizado' || raw === 'encerrado') return 'DONE';
    if (raw === 'em_andamento' || raw === 'live') return 'LIVE';
    return 'PENDING';
  }

  function renderStatus(status) {
    const normalized = normalizeStatus(status);
    if (normalized === 'DONE') return '<span class="pill done">Finalizado</span>';
    if (normalized === 'LIVE') return '<span class="pill warning">Em andamento</span>';
    return '<span class="pill">Agendado</span>';
  }

  function mapSorteioRow(row) {
    const id = extractMatchId(row);
    return {
      ...row,
      id: id || null,
      ordem: row?.ordem ?? '-',
      jogo: cleanLabel(row?.jogo || row?.numero_jogo || row?.jogo_label || (id ? `Jogo ${id}` : '-')),
      hora: cleanLabel(row?.hora || row?.hora_oficial || row?.hora_texto || ''),
      chave: cleanLabel(row?.chave || row?.chave_grupo || 'CH A'),
      equipeA: cleanLabel(row?.equipeA || row?.equipe_a || row?.equipeA_nome || '-'),
      equipeB: cleanLabel(row?.equipeB || row?.equipe_b || row?.equipeB_nome || '-'),
      status: row?.status || 'NAO_INICIADO',
      placar_a: row?.placar_a ?? null,
      placar_b: row?.placar_b ?? null,
      modalidade_id: row?.modalidade_id ?? null,
      sexo: row?.sexo || '',
    };
  }

  function serializeRowsForSave(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return list
      .map((row, idx) => {
        const equipeA = cleanLabel(row?.equipeA || row?.equipe_a || '');
        const equipeB = cleanLabel(row?.equipeB || row?.equipe_b || '');
        if (!equipeA || !equipeB) return null;
        return {
          chave: cleanLabel(row?.chave || row?.chave_grupo || 'CH A') || 'CH A',
          equipeA,
          equipeB,
          ordem: Number(row?.ordem || (idx + 1)) || (idx + 1),
          hora: cleanLabel(row?.hora || row?.hora_oficial || row?.hora_texto || ''),
          jogo: cleanLabel(row?.jogo || row?.numero_jogo || row?.jogo_label || `Jogo ${idx + 1}`),
        };
      })
      .filter(Boolean);
  }

  function setMessage(message, type = 'error') {
    const box = byId('painelSorteioMsg');
    if (!box) return;
    if (!message) {
      box.className = 'form-msg';
      box.textContent = '';
      return;
    }
    box.className = `form-msg show ${type === 'success' ? 'success' : 'error'}`;
    box.textContent = message;
  }

  function setKpi(id, value) {
    const el = byId(id);
    if (!el) return;
    el.textContent = String(value ?? 0);
  }

  function updateKpis() {
    const total = Array.isArray(state.allRows) ? state.allRows.length : 0;
    const chaves = new Set(
      (state.allRows || [])
        .map((row) => String(row?.chave || '').trim())
        .filter(Boolean)
    ).size;
    const finalizados = (state.allRows || []).filter((row) => normalizeStatus(row?.status) === 'DONE').length;
    setKpi('painelKpiJogos', total);
    setKpi('painelKpiChaves', chaves);
    setKpi('painelKpiFinalizados', finalizados);
  }

  function setStandingsPlaceholder(text) {
    const body = byId('painelStandingsBody');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="10" class="center muted" style="padding:16px;">${escapeHtml(text)}</td></tr>`;
  }

  function setSelectOptions(select, items, placeholder) {
    if (!select) return;
    const current = String(select.value || '');
    const unique = [];
    const seen = new Set();
    (items || []).forEach((item) => {
      if (!item || item.value == null) return;
      const key = String(item.value);
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(item);
    });
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + unique
      .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
      .join('');
    if (current && seen.has(current)) {
      select.value = current;
    }
  }

  function setButtonLoading(button, loading, idleLabel, loadingLabel) {
    if (!button) return;
    button.disabled = Boolean(loading);
    button.textContent = loading ? loadingLabel : idleLabel;
  }

  function setSorteioLoading(visible, text = 'Gerando tabela de sorteio...') {
    let overlay = byId('sorteioLoadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sorteioLoadingOverlay';
      overlay.className = 'sorteio-loading-overlay hidden';
      overlay.setAttribute('aria-live', 'polite');
      overlay.innerHTML = `
        <div class="sorteio-loading-card" role="status" aria-atomic="true">
          <div class="sorteio-loading-spinner" aria-hidden="true"></div>
          <p class="sorteio-loading-title">Sorteio em andamento</p>
          <p class="sorteio-loading-text"></p>
          <div class="sorteio-loading-bar" aria-hidden="true"><span></span></div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    const textNode = overlay.querySelector('.sorteio-loading-text');
    if (textNode) textNode.textContent = text;
    if (visible) {
      clearTimeout(sorteioLoadingTimer);
      sorteioLoadingTimer = null;
      overlay.classList.remove('hidden');
      document.body.classList.add('sorteio-loading-active');
      sorteioLoadingShownAt = Date.now();
      return;
    }

    const elapsed = Date.now() - sorteioLoadingShownAt;
    const remaining = Math.max(0, SORTEIO_LOADING_MIN_DURATION - elapsed);
    clearTimeout(sorteioLoadingTimer);
    sorteioLoadingTimer = setTimeout(() => {
      overlay.classList.add('hidden');
      document.body.classList.remove('sorteio-loading-active');
      sorteioLoadingTimer = null;
    }, remaining);
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, { credentials: 'include', ...options });
    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
    return { response, data };
  }

  function clearTables(message = 'Sem jogos carregados.') {
    state.allRows = [];
    state.rows = [];
    const bodyJogos = byId('sorteioBody');
    if (bodyJogos) {
      bodyJogos.innerHTML = `<tr><td colspan="9" class="center muted" style="padding:16px;">${escapeHtml(message)}</td></tr>`;
    }
    const bodyChaves = byId('sorteioChavesBody');
    if (bodyChaves) {
      bodyChaves.innerHTML = '<tr><td colspan="5" class="center muted" style="padding:16px;">Sem chaves carregadas.</td></tr>';
    }
    const chaveSelect = byId('sorteioChave');
    if (chaveSelect) chaveSelect.innerHTML = '<option value="">Todas</option>';
    byId('painelSorteioChaveLabel').textContent = '-';
    setStandingsPlaceholder('Selecione uma chave.');
    updateKpis();
  }

  function updateTitle() {
    const title = byId('sorteioTituloModalidade');
    if (!title) return;
    const eventoId = String(byId('sorteioEvento')?.value || '');
    const modalidadeId = String(byId('sorteioModalidade')?.value || '');
    const evento = state.eventos.find((item) => String(item.id) === eventoId);
    const modalidade = state.modalidades.find((item) => String(item.id) === modalidadeId);

    if (evento && modalidade) {
      title.textContent = `Tabela de sorteio - ${modalidade.nome || modalidade.titulo || 'Modalidade'} - ${evento.nome || 'Evento'}${evento.ano ? ` (${evento.ano})` : ''}`;
      return;
    }
    if (evento) {
      title.textContent = `Tabela de sorteio - Todas as modalidades - ${evento.nome || 'Evento'}${evento.ano ? ` (${evento.ano})` : ''}`;
      return;
    }
    title.textContent = 'Tabela de jogos';
  }

  function updateTelaoLink() {
    const link = byId('painelTelaoLink');
    if (!link) return;
    const eventoId = String(byId('sorteioEvento')?.value || '');
    link.href = eventoId ? `/telao?eventoId=${encodeURIComponent(eventoId)}` : '/telao';
  }

  function syncChaveOptions() {
    const select = byId('sorteioChave');
    if (!select) return;
    const current = String(select.value || '');
    const chaves = Array.from(new Set(state.allRows.map((row) => String(row.chave || 'CH A'))))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    select.innerHTML = '<option value="">Todas</option>' + chaves.map((chave) => `<option value="${escapeHtml(chave)}">${escapeHtml(chave)}</option>`).join('');
    if (current && chaves.includes(current)) {
      select.value = current;
    } else if (!current && chaves.length === 1) {
      select.value = chaves[0];
    }
  }

  function renderJogosTable() {
    const body = byId('sorteioBody');
    if (!body) return;
    if (!state.rows.length) {
      body.innerHTML = '<tr><td colspan="9" class="center muted" style="padding:16px;">Sem jogos para os filtros atuais.</td></tr>';
      return;
    }

    body.innerHTML = state.rows.map((row) => {
      const sumulaBtn = row.id
        ? `<button class="btn-outline btn-sm" type="button" data-open-sumula="${row.id}">Súmula</button>`
        : '<button class="btn-outline btn-sm" type="button" disabled>Súmula</button>';
      return `
        <tr class="${normalizeStatus(row.status) === 'DONE' ? 'is-done' : ''}">
          <td class="sorteio-col-center">${escapeHtml(row.ordem)}</td>
          <td class="sorteio-col-center">${escapeHtml(row.jogo || '-')}</td>
          <td class="sorteio-col-center">${escapeHtml(row.hora || 'A seguir')}</td>
          <td class="sorteio-col-center"><span class="sorteio-key-badge">${escapeHtml(row.chave || '-')}</span></td>
          <td><span class="sorteio-team-name" title="${escapeHtml(row.equipeA || '-')}">${escapeHtml(row.equipeA || '-')}</span></td>
          <td class="placar">X</td>
          <td><span class="sorteio-team-name" title="${escapeHtml(row.equipeB || '-')}">${escapeHtml(row.equipeB || '-')}</span></td>
          <td class="sorteio-col-center">${renderStatus(row.status)}</td>
          <td class="sorteio-col-center">${sumulaBtn}</td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('[data-open-sumula]').forEach((button) => {
      button.addEventListener('click', () => {
        const matchId = Number(button.dataset.openSumula || 0);
        if (!matchId) return;
        const url = `${SUMULA_PAGE_URL}?jogo=${encodeURIComponent(matchId)}`;
        window.location.href = url;
      });
    });
  }

  function renderChavesTable() {
    const body = byId('sorteioChavesBody');
    if (!body) return;
    if (!state.allRows.length) {
      body.innerHTML = '<tr><td colspan="5" class="center muted" style="padding:16px;">Sem chaves carregadas.</td></tr>';
      return;
    }

    const grouped = new Map();
    state.allRows.forEach((row) => {
      const chave = String(row.chave || 'CH A');
      if (!grouped.has(chave)) {
        grouped.set(chave, { chave, equipes: new Set(), total: 0, done: 0 });
      }
      const entry = grouped.get(chave);
      entry.total += 1;
      if (normalizeStatus(row.status) === 'DONE') entry.done += 1;
      if (row.equipeA && row.equipeA !== '-') entry.equipes.add(String(row.equipeA).trim());
      if (row.equipeB && row.equipeB !== '-') entry.equipes.add(String(row.equipeB).trim());
    });

    const selected = String(byId('sorteioChave')?.value || '');
    const rows = Array.from(grouped.values()).sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR', { sensitivity: 'base' }));
    body.innerHTML = rows.map((row) => {
      const teams = Array.from(row.equipes).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      const teamRows = teams.length
        ? teams.map((team, index) => `
            <tr>
              <td class="sorteio-equipes-mini-pos">${index + 1}</td>
              <td class="sorteio-equipes-mini-name">${escapeHtml(team)}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="2" class="sorteio-equipes-mini-empty">Sem equipes</td></tr>';
      const progress = row.total ? Math.round((row.done / row.total) * 100) : 0;
      const isActive = selected === row.chave;
      return `
        <tr class="sorteio-chave-row${isActive ? ' is-active' : ''}">
          <td><span class="sorteio-key-badge">${escapeHtml(row.chave)}</span></td>
          <td>
            <div class="sorteio-equipes-box">
              <div class="sorteio-equipes-head">
                <span class="sorteio-num-chip">${row.equipes.size}</span>
                <span>Equipes da chave</span>
              </div>
              <table class="sorteio-equipes-mini" aria-label="Equipes ${escapeHtml(row.chave)}">
                <tbody>
                  ${teamRows}
                </tbody>
              </table>
            </div>
          </td>
          <td class="sorteio-col-center">${row.total}</td>
          <td>
            <div class="sorteio-progress-wrap">
              <div class="sorteio-progress-bar"><span style="width:${progress}%"></span></div>
              <small>${row.done}/${row.total}</small>
            </div>
          </td>
          <td class="sorteio-col-center">
            <button class="${isActive ? 'btn-primary' : 'btn-outline'} btn-sm" type="button" data-select-chave="${escapeHtml(row.chave)}">${isActive ? 'Filtrando' : 'Ver jogos'}</button>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('[data-select-chave]').forEach((button) => {
      button.addEventListener('click', () => {
        const select = byId('sorteioChave');
        if (!select) return;
        select.value = String(button.dataset.selectChave || '');
        applyFilter();
      });
    });
  }

  function renderStandings(rows) {
    const body = byId('painelStandingsBody');
    if (!body) return;
    if (!Array.isArray(rows) || !rows.length) {
      body.innerHTML = '<tr><td colspan="10" class="center muted" style="padding:16px;">Sem dados para esta chave.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.equipe || '-')}</td>
        <td>${Number(row.pontos || 0)}</td>
        <td>${Number(row.jogos || 0)}</td>
        <td>${Number(row.vitorias || 0)}</td>
        <td>${Number(row.empates || 0)}</td>
        <td>${Number(row.derrotas || 0)}</td>
        <td>${Number(row.pro || 0)}</td>
        <td>${Number(row.contra || 0)}</td>
        <td>${Number(row.saldo || 0)}</td>
      </tr>
    `).join('');
  }

  async function refreshStandings() {
    const eventoId = String(byId('sorteioEvento')?.value || '');
    const modalidadeId = String(byId('sorteioModalidade')?.value || '');
    const sexo = String(byId('sorteioSexo')?.value || '');
    const chave = String(byId('sorteioChave')?.value || '');
    byId('painelSorteioChaveLabel').textContent = chave || '-';

    if (!modalidadeId || !sexo || !chave) {
      setStandingsPlaceholder('Selecione modalidade, sexo e chave.');
      return;
    }

    setStandingsPlaceholder('Carregando...');
    try {
      const { response, data } = await requestJson(
        `/sumulas/tabela?evento_id=${encodeURIComponent(eventoId)}&modalidade_id=${encodeURIComponent(modalidadeId)}&sexo=${encodeURIComponent(sexo)}&chave=${encodeURIComponent(chave)}`
      );
      if (response.status === 401) {
        setMessage('Sessão expirada. Faça login novamente.', 'error');
        setStandingsPlaceholder('Sessão expirada.');
        return;
      }
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Falha ao carregar classificação.');
      }
      renderStandings(data.standings || []);
    } catch (err) {
      setStandingsPlaceholder(err.message || 'Falha ao carregar classificação.');
    }
  }

  function applyFilter() {
    const chave = String(byId('sorteioChave')?.value || '');
    state.rows = chave
      ? state.allRows.filter((row) => String(row.chave || '') === chave)
      : [...state.allRows];
    renderChavesTable();
    renderJogosTable();
    refreshStandings();
    updateKpis();
  }

  async function fetchEventos() {
    const select = byId('sorteioEvento');
    if (!select) return;
    try {
      const { response, data } = await requestJson('/eventos');
      if (response.status === 401) {
        setMessage('Sessão expirada. Faça login novamente.', 'error');
        return;
      }
      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro?.mensagem || 'Não foi possível carregar eventos.');
      }
      state.eventos = Array.isArray(data.data) ? data.data : [];
      setSelectOptions(
        select,
        state.eventos.map((item) => ({
          value: item.id,
          label: `${item.nome || 'Evento'}${item.ano ? ` (${item.ano})` : ''}`,
        })),
        'Evento'
      );
      if (!select.value && state.eventos.length) {
        const preferred = state.eventos.find((item) => item.status === 'ABERTO' || item.status === 'EM_ANDAMENTO') || state.eventos[0];
        if (preferred) select.value = String(preferred.id);
      }
    } catch (err) {
      setMessage(err.message || 'Não foi possível carregar eventos.', 'error');
      setSelectOptions(select, [], 'Evento');
    }
  }

  async function fetchModalidades() {
    const select = byId('sorteioModalidade');
    if (!select) return;

    let items = [];
    try {
      let responseWrap = await requestJson('/api/modalidades');
      if (responseWrap.response.status === 404) {
        responseWrap = await requestJson('/modalidades');
      }
      if (!responseWrap.response.ok) {
        throw new Error('Não foi possível carregar modalidades.');
      }
      const payload = responseWrap.data;
      items = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
    } catch (_) {
      items = [];
    }

    state.modalidades = items;
    setSelectOptions(
      select,
      state.modalidades.map((item) => ({
        value: item.id,
        label: item.nome || item.titulo || `Modalidade ${item.id}`,
      })),
      'Todas as modalidades'
    );
  }

  async function carregarTabela() {
    setMessage('');
    const eventoId = String(byId('sorteioEvento')?.value || '');
    const modalidadeId = String(byId('sorteioModalidade')?.value || '');
    const sexo = String(byId('sorteioSexo')?.value || '');

    if (!eventoId || !modalidadeId || !sexo) {
      clearTables('Selecione evento, modalidade e sexo para carregar.');
      setMessage('Selecione evento, modalidade e sexo para carregar a tabela.', 'error');
      return;
    }

    const loadBtn = byId('painelLoadBtn');
    setButtonLoading(loadBtn, true, 'Carregar tabela', 'Carregando...');
    setSorteioLoading(true, 'Carregando tabela de sorteio...');
    try {
      const { response, data } = await requestJson(`/sorteio/${encodeURIComponent(eventoId)}/${encodeURIComponent(modalidadeId)}/${encodeURIComponent(sexo)}`);
      if (response.status === 401) {
        setMessage('Sessão expirada. Faça login novamente.', 'error');
        clearTables('Sessão expirada.');
        return;
      }
      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro?.mensagem || 'Falha ao carregar tabela.');
      }

      const jogos = Array.isArray(data?.data?.jogos) ? data.data.jogos : [];
      state.allRows = jogos.map(mapSorteioRow);
      syncChaveOptions();
      updateTitle();
      applyFilter();
      if (!state.allRows.length) {
        setMessage('Tabela carregada, mas ainda sem jogos.', 'error');
      }
    } catch (err) {
      clearTables('Falha ao carregar tabela.');
      setMessage(err.message || 'Falha ao carregar tabela.', 'error');
    } finally {
      setSorteioLoading(false);
      setButtonLoading(loadBtn, false, 'Carregar tabela', 'Carregando...');
    }
  }

  async function gerarTabela() {
    setMessage('');
    const eventoId = String(byId('sorteioEvento')?.value || '');
    const modalidadeId = String(byId('sorteioModalidade')?.value || '');
    const sexo = String(byId('sorteioSexo')?.value || '');
    const localJogos = cleanLabel(byId('sorteioLocal')?.value || '') || 'Quadra A';
    const modo = String(byId('sorteioModo')?.value || 'GRUPOS');
    const horaInicio = String(byId('sorteioHoraInicio')?.value || '07:30');
    const intervaloMin = Number(byId('sorteioIntervalo')?.value || 0);

    if (!eventoId || !sexo) {
      setMessage('Selecione evento e sexo para gerar o sorteio.', 'error');
      return;
    }

    const generateBtn = byId('painelGenerateBtn');
    setButtonLoading(generateBtn, true, 'Gerar tabela', 'Gerando...');
    setSorteioLoading(
      true,
      modalidadeId
        ? 'Gerando sorteio da modalidade selecionada...'
        : 'Gerando sorteio para todas as modalidades...'
    );
    try {
      const payload = {
        evento_id: eventoId,
        sexo,
        local_jogos: localJogos,
        modo,
        hora_inicio: horaInicio,
        intervalo_min: intervaloMin,
      };
      if (modalidadeId) payload.modalidade_id = modalidadeId;

      const { response, data } = await requestJson('/sorteio/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        setMessage('Sessão expirada. Faça login novamente.', 'error');
        return;
      }
      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro?.mensagem || 'Falha ao gerar sorteio.');
      }

      if (modalidadeId) {
        const jogos = Array.isArray(data?.data?.jogos) ? data.data.jogos : [];
        state.allRows = jogos.map(mapSorteioRow);
        syncChaveOptions();
        updateTitle();
        applyFilter();
        setMessage('Tabela gerada e salva com sucesso.', 'success');
      } else {
        clearTables('Sorteio gerado para todas as modalidades. Selecione uma modalidade e clique em "Carregar tabela".');
        const total = Number(data?.data?.total_modalidades || 0);
        const label = total > 0 ? `Sorteio gerado e salvo para ${total} modalidades.` : 'Sorteio gerado e salvo para todas as modalidades.';
        setMessage(label, 'success');
      }
    } catch (err) {
      setMessage(err.message || 'Falha ao gerar sorteio.', 'error');
    } finally {
      setSorteioLoading(false);
      setButtonLoading(generateBtn, false, 'Gerar tabela', 'Gerando...');
    }
  }

  async function aplicarHorarios() {
    setMessage('');
    const eventoId = String(byId('sorteioEvento')?.value || '');
    const modalidadeId = String(byId('sorteioModalidade')?.value || '');
    const sexo = String(byId('sorteioSexo')?.value || '');
    const horaInicio = String(byId('sorteioHoraInicio')?.value || '07:30');
    const intervaloMin = Number(byId('sorteioIntervalo')?.value || 0);
    if (!eventoId || !modalidadeId || !sexo) {
      setMessage('Selecione evento, modalidade e sexo para aplicar horários.', 'error');
      return;
    }

    const applyBtn = byId('painelApplyTimeBtn');
    setButtonLoading(applyBtn, true, 'Aplicar horários', 'Aplicando...');
    setSorteioLoading(true, 'Aplicando horários nos jogos...');
    try {
      const { response, data } = await requestJson('/sorteio/horarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento_id: eventoId,
          modalidade_id: modalidadeId,
          sexo,
          hora_inicio: horaInicio,
          intervalo_min: intervaloMin,
        }),
      });
      if (response.status === 401) {
        setMessage('Sessão expirada. Faça login novamente.', 'error');
        return;
      }
      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro?.mensagem || 'Falha ao aplicar horários.');
      }
      setMessage('Horários aplicados com sucesso.', 'success');
      await carregarTabela();
    } catch (err) {
      setMessage(err.message || 'Falha ao aplicar horários.', 'error');
    } finally {
      setSorteioLoading(false);
      setButtonLoading(applyBtn, false, 'Aplicar horários', 'Aplicando...');
    }
  }

  async function salvarTabela() {
    setMessage('');
    const eventoId = String(byId('sorteioEvento')?.value || '');
    const modalidadeId = String(byId('sorteioModalidade')?.value || '');
    const sexo = String(byId('sorteioSexo')?.value || '');
    const localJogos = cleanLabel(byId('sorteioLocal')?.value || '') || 'Quadra A';
    const modo = String(byId('sorteioModo')?.value || 'GRUPOS');
    const horaInicio = String(byId('sorteioHoraInicio')?.value || '07:30');
    const intervaloMin = Number(byId('sorteioIntervalo')?.value || 0);

    if (!eventoId || !modalidadeId || !sexo) {
      setMessage('Selecione evento, modalidade e sexo para salvar.', 'error');
      return;
    }

    const sourceRows = state.allRows.length ? state.allRows : state.rows;
    const jogos = serializeRowsForSave(sourceRows);
    if (!jogos.length) {
      setMessage('Gere ou carregue uma tabela antes de salvar.', 'error');
      return;
    }

    const saveBtn = byId('painelSaveBtn');
    setButtonLoading(saveBtn, true, 'Salvar sorteio', 'Salvando...');
    setSorteioLoading(true, 'Salvando sorteio...');
    try {
      const { response, data } = await requestJson('/sorteio/salvar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento_id: eventoId,
          modalidade_id: modalidadeId,
          sexo,
          local_jogos: localJogos,
          modo,
          hora_inicio: horaInicio,
          intervalo_min: intervaloMin,
          jogos,
        }),
      });
      if (response.status === 401) {
        setMessage('Sessão expirada. Faça login novamente.', 'error');
        return;
      }
      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro?.mensagem || 'Falha ao salvar sorteio.');
      }

      const jogosPersistidos = Array.isArray(data?.data?.jogos) ? data.data.jogos : [];
      state.allRows = jogosPersistidos.map(mapSorteioRow);
      syncChaveOptions();
      updateTitle();
      applyFilter();
      setMessage('Sorteio salvo com sucesso.', 'success');
    } catch (err) {
      setMessage(err.message || 'Falha ao salvar sorteio.', 'error');
    } finally {
      setSorteioLoading(false);
      setButtonLoading(saveBtn, false, 'Salvar sorteio', 'Salvando...');
    }
  }

  async function downloadTabela(formato = 'csv') {
    setMessage('');
    const eventoId = String(byId('sorteioEvento')?.value || '');
    const modalidadeId = String(byId('sorteioModalidade')?.value || '');
    const sexo = String(byId('sorteioSexo')?.value || '');
    const formatoNorm = String(formato || 'csv').toLowerCase() === 'pdf' ? 'pdf' : 'csv';
    const extensao = formatoNorm.toUpperCase();

    if (!eventoId || !modalidadeId || !sexo) {
      setMessage('Selecione evento, modalidade e sexo para baixar a tabela.', 'error');
      return;
    }

    const downloadBtn = formatoNorm === 'pdf' ? byId('painelDownloadPdfBtn') : byId('painelDownloadCsvBtn');
    setButtonLoading(downloadBtn, true, `Baixar ${extensao}`, 'Baixando...');
    setSorteioLoading(true, `Preparando download ${extensao}...`);
    try {
      const response = await fetch(
        `/sorteio/${encodeURIComponent(eventoId)}/${encodeURIComponent(modalidadeId)}/${encodeURIComponent(sexo)}/download?formato=${encodeURIComponent(formatoNorm)}`,
        { credentials: 'include' }
      );

      if (response.status === 401) {
        setMessage('Sessao expirada. Faca login novamente.', 'error');
        return;
      }

      if (!response.ok) {
        let message = 'Falha ao baixar a tabela.';
        try {
          const body = await response.json();
          message = body?.erro?.mensagem || message;
        } catch (_) {
          // ignora parse para respostas nao-json
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const cd = response.headers.get('content-disposition') || '';
      const filenameMatch = cd.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || `tabela_sorteio_${eventoId}_${modalidadeId}_${sexo}.${formatoNorm}`;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setMessage(`Download ${extensao} iniciado.`, 'success');
    } catch (err) {
      setMessage(err.message || 'Falha ao baixar a tabela.', 'error');
    } finally {
      setSorteioLoading(false);
      setButtonLoading(downloadBtn, false, `Baixar ${extensao}`, 'Baixando...');
    }
  }

  async function limparSorteio() {
    setMessage('');
    const eventoId = String(byId('sorteioEvento')?.value || '');
    const modalidadeId = String(byId('sorteioModalidade')?.value || '');
    const sexo = String(byId('sorteioSexo')?.value || '');
    if (!eventoId || !modalidadeId || !sexo) {
      setMessage('Selecione evento, modalidade e sexo para limpar.', 'error');
      return;
    }

    const clearBtn = byId('painelClearBtn');
    setButtonLoading(clearBtn, true, 'Limpar', 'Limpando...');
    setSorteioLoading(true, 'Limpando sorteio...');
    try {
      const { response, data } = await requestJson('/sorteio/limpar', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento_id: eventoId,
          modalidade_id: modalidadeId,
          sexo,
        }),
      });
      if (response.status === 401) {
        setMessage('Sessão expirada. Faça login novamente.', 'error');
        return;
      }
      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro?.mensagem || 'Falha ao limpar sorteio.');
      }
      clearTables('Sorteio limpo.');
      setMessage('Sorteio limpo com sucesso.', 'success');
    } catch (err) {
      setMessage(err.message || 'Falha ao limpar sorteio.', 'error');
    } finally {
      setSorteioLoading(false);
      setButtonLoading(clearBtn, false, 'Limpar', 'Limpando...');
    }
  }

  async function gerarMataMata() {
    setMessage('');
    const eventoId = String(byId('sorteioEvento')?.value || '');
    const modalidadeId = String(byId('sorteioModalidade')?.value || '');
    const sexo = String(byId('sorteioSexo')?.value || '');
    const localJogos = cleanLabel(byId('sorteioLocal')?.value || '') || 'Quadra A';
    const horaInicio = String(byId('sorteioHoraInicio')?.value || '07:30');

    if (!eventoId || !modalidadeId || !sexo) {
      setMessage('Selecione evento, modalidade e sexo para gerar o mata-mata.', 'error');
      return;
    }

    const knockoutBtn = byId('painelGenerateKnockoutBtn');
    setButtonLoading(knockoutBtn, true, 'Gerar mata-mata', 'Gerando...');
    setSorteioLoading(true, 'Gerando cruzamentos do mata-mata...');
    try {
      const { response, data } = await requestJson('/sorteio/mata-mata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento_id: eventoId,
          modalidade_id: modalidadeId,
          sexo,
          local_jogos: localJogos,
          hora_inicio: horaInicio,
        }),
      });

      if (response.status === 401) {
        setMessage('Sessão expirada. Faça login novamente.', 'error');
        return;
      }
      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro?.mensagem || 'Falha ao gerar mata-mata.');
      }

      const jogos = Array.isArray(data?.data?.jogos) ? data.data.jogos : [];
      state.allRows = jogos.map(mapSorteioRow);
      syncChaveOptions();
      updateTitle();
      applyFilter();
      setMessage('Mata-mata gerado com sucesso.', 'success');
    } catch (err) {
      setMessage(err.message || 'Falha ao gerar mata-mata.', 'error');
    } finally {
      setSorteioLoading(false);
      setButtonLoading(knockoutBtn, false, 'Gerar mata-mata', 'Gerando...');
    }
  }

  function bindEvents() {
    byId('painelLoadBtn')?.addEventListener('click', carregarTabela);
    byId('painelGenerateBtn')?.addEventListener('click', gerarTabela);
    byId('painelGenerateKnockoutBtn')?.addEventListener('click', gerarMataMata);
    byId('painelSaveBtn')?.addEventListener('click', salvarTabela);
    byId('painelDownloadCsvBtn')?.addEventListener('click', () => downloadTabela('csv'));
    byId('painelDownloadPdfBtn')?.addEventListener('click', () => downloadTabela('pdf'));
    byId('painelApplyTimeBtn')?.addEventListener('click', aplicarHorarios);
    byId('painelClearBtn')?.addEventListener('click', limparSorteio);
    byId('painelRefreshStandingsBtn')?.addEventListener('click', refreshStandings);

    byId('sorteioChave')?.addEventListener('change', applyFilter);
    byId('sorteioEvento')?.addEventListener('change', () => {
      updateTitle();
      updateTelaoLink();
      clearTables('Selecione os filtros e carregue a tabela.');
    });
    byId('sorteioModalidade')?.addEventListener('change', () => {
      updateTitle();
      clearTables('Selecione os filtros e carregue a tabela.');
    });
    byId('sorteioSexo')?.addEventListener('change', () => {
      clearTables('Selecione os filtros e carregue a tabela.');
    });
  }

  function applyQueryDefaults() {
    const params = new URLSearchParams(window.location.search);
    const eventoId = params.get('eventoId') || '';
    const modalidadeId = params.get('modalidadeId') || '';
    const sexo = params.get('sexo') || '';
    const chave = params.get('chave') || '';

    if (eventoId && byId('sorteioEvento')) byId('sorteioEvento').value = eventoId;
    if (modalidadeId && byId('sorteioModalidade')) byId('sorteioModalidade').value = modalidadeId;
    if (sexo && byId('sorteioSexo')) byId('sorteioSexo').value = sexo;
    if (chave && byId('sorteioChave')) byId('sorteioChave').value = chave;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    clearTables('Selecione os filtros e carregue a tabela.');
    await Promise.all([fetchEventos(), fetchModalidades()]);
    applyQueryDefaults();
    updateTitle();
    updateTelaoLink();

    const eventoId = String(byId('sorteioEvento')?.value || '');
    const modalidadeId = String(byId('sorteioModalidade')?.value || '');
    const sexo = String(byId('sorteioSexo')?.value || '');
    if (eventoId && modalidadeId && sexo) {
      await carregarTabela();
    }
  });
})();
