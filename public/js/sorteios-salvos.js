(() => {
  const SUMULA_PAGE_URL = '/sumula.html';
  const state = {
    eventos: [],
    modalidades: [],
    items: [],
  };

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

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR');
  }

  function sexoLabel(value) {
    const v = String(value || '').toUpperCase();
    if (v === 'M') return 'Masculino';
    if (v === 'F') return 'Feminino';
    if (v === 'X') return 'Misto';
    return v || '-';
  }

  function setMessage(message, type = 'error') {
    const box = byId('salvosMsg');
    if (!box) return;
    if (!message) {
      box.className = 'form-msg';
      box.textContent = '';
      return;
    }
    box.className = `form-msg show ${type === 'success' ? 'success' : 'error'}`;
    box.textContent = message;
  }

  function ensureDeleteConfirmModal() {
    let modal = byId('salvosDeleteConfirmModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'salvosDeleteConfirmModal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h2 id="salvosDeleteConfirmTitle">Excluir sorteio salvo</h2>
          <button class="icon-btn" type="button" id="salvosDeleteConfirmClose">x</button>
        </div>
        <div class="modal-body">
          <p id="salvosDeleteConfirmText">Tem certeza que deseja continuar?</p>
        </div>
        <div class="modal-footer">
          <button class="btn-outline" type="button" id="salvosDeleteConfirmCancel">Cancelar</button>
          <button class="btn-danger" type="button" id="salvosDeleteConfirmOk">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function askDeleteConfirm(message) {
    const modal = ensureDeleteConfirmModal();
    const text = modal.querySelector('#salvosDeleteConfirmText');
    const closeBtn = modal.querySelector('#salvosDeleteConfirmClose');
    const cancelBtn = modal.querySelector('#salvosDeleteConfirmCancel');
    const confirmBtn = modal.querySelector('#salvosDeleteConfirmOk');

    if (text) text.textContent = message || 'Tem certeza que deseja continuar?';

    return new Promise((resolve) => {
      const finish = (result) => {
        modal.classList.add('hidden');
        closeBtn?.removeEventListener('click', onClose);
        cancelBtn?.removeEventListener('click', onClose);
        confirmBtn?.removeEventListener('click', onConfirm);
        modal.removeEventListener('click', onBackdrop);
        resolve(result);
      };

      const onClose = () => finish(false);
      const onConfirm = () => finish(true);
      const onBackdrop = (ev) => {
        if (ev.target === modal) finish(false);
      };

      closeBtn?.addEventListener('click', onClose);
      cancelBtn?.addEventListener('click', onClose);
      confirmBtn?.addEventListener('click', onConfirm);
      modal.addEventListener('click', onBackdrop);
      modal.classList.remove('hidden');
      setTimeout(() => confirmBtn?.focus?.(), 0);
    });
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

  function setSelectOptions(select, items, placeholder) {
    if (!select) return;
    const current = String(select.value || '');
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + (items || [])
      .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
      .join('');
    if (current) select.value = current;
  }

  function renderRows() {
    const body = byId('salvosBody');
    if (!body) return;
    if (!state.items.length) {
      body.innerHTML = '<tr><td colspan="7" class="center muted" style="padding:16px;">Nenhum sorteio salvo para os filtros selecionados.</td></tr>';
      return;
    }

    body.innerHTML = state.items.map((item, index) => {
      const eventoNome = item.evento_nome
        ? `${item.evento_nome}${item.evento_ano ? ` (${item.evento_ano})` : ''}`
        : `Evento ${item.evento_id || '-'}`;
      const modalidadeNome = item.modalidade_nome || `Modalidade ${item.modalidade_id || '-'}`;
      const atualizado = item.atualizado_em || item.criado_em;
      const hasContext = Boolean(item.evento_id && item.modalidade_id && item.sexo);
      const hasJogo = Number(item.primeiro_jogo_id || 0) > 0;

      return `
        <tr>
          <td>${escapeHtml(eventoNome)}</td>
          <td>${escapeHtml(modalidadeNome)}</td>
          <td><span class="sorteios-badge">${escapeHtml(sexoLabel(item.sexo))}</span></td>
          <td>${Number(item.jogos_total || 0)}</td>
          <td>${Number(item.jogos_finalizados || 0)}</td>
          <td>${escapeHtml(formatDateTime(atualizado))}</td>
          <td>
            <div class="sorteios-row-actions">
              <button class="btn-primary" type="button" data-action="editar" data-index="${index}" ${hasContext ? '' : 'disabled'}>Editar</button>
              <button class="btn-outline" type="button" data-action="sumula" data-index="${index}" ${hasJogo ? '' : 'disabled'}>Sumula</button>
              <button class="btn-outline" type="button" data-action="csv" data-index="${index}" ${hasContext ? '' : 'disabled'}>CSV</button>
              <button class="btn-outline" type="button" data-action="pdf" data-index="${index}" ${hasContext ? '' : 'disabled'}>PDF</button>
              <button class="btn-danger" type="button" data-action="excluir" data-index="${index}" ${hasContext ? '' : 'disabled'}>Excluir</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function fetchEventos() {
    const select = byId('salvosEvento');
    if (!select) return;
    try {
      const { response, data } = await requestJson('/eventos');
      if (response.status === 401) {
        setMessage('Sessao expirada. Faca login novamente.', 'error');
        return;
      }
      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro?.mensagem || 'Falha ao carregar eventos.');
      }
      state.eventos = Array.isArray(data.data) ? data.data : [];
      setSelectOptions(
        select,
        state.eventos.map((item) => ({
          value: item.id,
          label: `${item.nome || 'Evento'}${item.ano ? ` (${item.ano})` : ''}`,
        })),
        'Todos os eventos'
      );
    } catch (err) {
      setMessage(err.message || 'Falha ao carregar eventos.', 'error');
    }
  }

  async function fetchModalidades() {
    const select = byId('salvosModalidade');
    if (!select) return;
    let list = [];
    try {
      let wrap = await requestJson('/api/modalidades');
      if (wrap.response.status === 404) {
        wrap = await requestJson('/modalidades');
      }
      if (!wrap.response.ok) throw new Error('Falha ao carregar modalidades.');
      const payload = wrap.data;
      list = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
    } catch (err) {
      setMessage(err.message || 'Falha ao carregar modalidades.', 'error');
    }

    state.modalidades = list;
    setSelectOptions(
      select,
      state.modalidades.map((item) => ({
        value: item.id,
        label: item.nome || item.titulo || `Modalidade ${item.id}`,
      })),
      'Todas as modalidades'
    );
  }

  async function fetchSalvos() {
    setMessage('');
    const eventoId = String(byId('salvosEvento')?.value || '');
    const modalidadeId = String(byId('salvosModalidade')?.value || '');
    const sexo = String(byId('salvosSexo')?.value || '').toUpperCase();

    const query = new URLSearchParams();
    if (eventoId) query.set('evento_id', eventoId);
    if (modalidadeId) query.set('modalidade_id', modalidadeId);
    if (sexo) query.set('sexo', sexo);

    const url = query.toString() ? `/sorteio/salvos?${query.toString()}` : '/sorteio/salvos';
    const body = byId('salvosBody');
    if (body) {
      body.innerHTML = '<tr><td colspan="7" class="center muted" style="padding:16px;">Carregando...</td></tr>';
    }

    try {
      const { response, data } = await requestJson(url);
      if (response.status === 401) {
        setMessage('Sessao expirada. Faca login novamente.', 'error');
        renderRows();
        return;
      }
      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro?.mensagem || 'Falha ao carregar sorteios salvos.');
      }
      state.items = Array.isArray(data?.data?.items) ? data.data.items : [];
      renderRows();
    } catch (err) {
      state.items = [];
      renderRows();
      setMessage(err.message || 'Falha ao carregar sorteios salvos.', 'error');
    }
  }

  function openEditar(item) {
    const query = new URLSearchParams({
      eventoId: String(item.evento_id || ''),
      modalidadeId: String(item.modalidade_id || ''),
      sexo: String(item.sexo || ''),
    });
    window.location.href = `/painel-sorteio.html?${query.toString()}`;
  }

  function openSumula(item) {
    const jogoId = Number(item.primeiro_jogo_id || 0);
    if (!jogoId) {
      setMessage('Esse sorteio ainda nao possui jogo vinculado para abrir sumula.', 'error');
      return;
    }
    window.location.href = `${SUMULA_PAGE_URL}?jogo=${encodeURIComponent(jogoId)}`;
  }

  async function downloadTabela(item, formato) {
    const formatoNorm = formato === 'pdf' ? 'pdf' : 'csv';
    const response = await fetch(
      `/sorteio/${encodeURIComponent(item.evento_id)}/${encodeURIComponent(item.modalidade_id)}/${encodeURIComponent(item.sexo)}/download?formato=${formatoNorm}`,
      { credentials: 'include' }
    );

    if (response.status === 401) {
      setMessage('Sessao expirada. Faca login novamente.', 'error');
      return;
    }

    if (!response.ok) {
      let message = 'Falha ao baixar arquivo.';
      try {
        const body = await response.json();
        message = body?.erro?.mensagem || message;
      } catch (_) {
        // resposta nao-json
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const cd = response.headers.get('content-disposition') || '';
    const filenameMatch = cd.match(/filename="?([^"]+)"?/i);
    const filename = filenameMatch?.[1] || `tabela_sorteio.${formatoNorm}`;

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    setMessage(`Download ${formatoNorm.toUpperCase()} iniciado.`, 'success');
  }

  async function excluirSorteio(item) {
    const ok = await askDeleteConfirm('Deseja excluir esse sorteio salvo? Essa acao remove todos os jogos dessa chave/modalidade.');
    if (!ok) return;

    const { response, data } = await requestJson('/sorteio/limpar', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evento_id: item.evento_id,
        modalidade_id: item.modalidade_id,
        sexo: item.sexo,
      }),
    });

    if (response.status === 401) {
      setMessage('Sessao expirada. Faca login novamente.', 'error');
      return;
    }

    if (!response.ok || !data?.sucesso) {
      throw new Error(data?.erro?.mensagem || 'Falha ao excluir sorteio.');
    }

    setMessage('Sorteio excluido com sucesso.', 'success');
    await fetchSalvos();
  }

  function bindEvents() {
    byId('salvosFiltrarBtn')?.addEventListener('click', fetchSalvos);
    byId('salvosAtualizarBtn')?.addEventListener('click', fetchSalvos);
    byId('salvosLimparBtn')?.addEventListener('click', async () => {
      if (byId('salvosEvento')) byId('salvosEvento').value = '';
      if (byId('salvosModalidade')) byId('salvosModalidade').value = '';
      if (byId('salvosSexo')) byId('salvosSexo').value = '';
      await fetchSalvos();
    });

    byId('salvosBody')?.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action][data-index]');
      if (!button) return;

      const action = button.dataset.action;
      const index = Number(button.dataset.index);
      const item = state.items[index];
      if (!item) return;

      try {
        if (action === 'editar') {
          openEditar(item);
          return;
        }
        if (action === 'sumula') {
          openSumula(item);
          return;
        }
        if (action === 'csv') {
          await downloadTabela(item, 'csv');
          return;
        }
        if (action === 'pdf') {
          await downloadTabela(item, 'pdf');
          return;
        }
        if (action === 'excluir') {
          await excluirSorteio(item);
          return;
        }
      } catch (err) {
        setMessage(err.message || 'Falha ao executar a acao.', 'error');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    await Promise.all([fetchEventos(), fetchModalidades()]);
    await fetchSalvos();
  });
})();
