
(() => {
  const baseShowToast = window.showToast;
  if (typeof baseShowToast === 'function' && !baseShowToast.__dual) {
    const wrapper = (arg, type = 'info') => {
      if (typeof arg === 'string') {
        const title = type === 'error' ? 'Erro' : type === 'warning' ? 'Aviso' : 'Concluido';
        return baseShowToast({ type, title, message: arg });
      }
      return baseShowToast(arg || { type: 'info', message: '' });
    };
    wrapper.__dual = true;
    window.showToast = wrapper;
  }

  const safeShowToast = window.showToast || (() => {});
  const safeShowLoading = window.showLoading || (() => {});
  const safeConfirm = window.openConfirmModal || (() => {});
  const ADMIN_LOGIN_URL = 'index.html';

  let adminSessionExpired = false;

  function showSessionBanner(message) {
    if (adminSessionExpired || window.__adminSessionExpired) return;
    const banner = document.getElementById('sessionBanner');
    const text = document.getElementById('sessionBannerText');
    if (text) text.textContent = message || 'Sessão expirada. Faça login novamente.';
    if (banner) banner.classList.remove('hidden');
    adminSessionExpired = true;
    window.__adminSessionExpired = true;
    try {
      sessionStorage.setItem('adminSessionExpired', '1');
    } catch (_) {}
  }

  function clearSessionBanner() {
    const banner = document.getElementById('sessionBanner');
    if (banner) banner.classList.add('hidden');
    adminSessionExpired = false;
    window.__adminSessionExpired = false;
    try {
      sessionStorage.removeItem('adminSessionExpired');
    } catch (_) {}
  }

  function handleUnauthorized(message) {
    showSessionBanner(message || 'Sessão expirada. Faça login novamente.');
  }

  function validateEmailField(value, helpId, inputId) {
    const email = String(value || '').trim();
    if (!email) {
      setHelpById(inputId, helpId, 'Email obrigatório.');
      return false;
    }
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    setHelpById(inputId, helpId, ok ? '' : 'Email inválido.');
    return ok;
  }

  function setHelpById(inputId, helpId, msg) {
    const input = document.getElementById(inputId);
    const help = document.getElementById(helpId);
    if (!input) return;
    if (help) help.textContent = msg || '';
    input.classList.toggle('input-erro', Boolean(msg));
  }

  function scrollToFirstError(container) {
    const root = container || document;
    const target = root.querySelector('.input-erro');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }
  }

  async function ensureAdminSession() {
    try {
      if (adminSessionExpired || sessionStorage.getItem('adminSessionExpired') === '1') {
        showSessionBanner('Sessão expirada. Faça login novamente.');
        return;
      }
      const res = await fetch('/auth/admin/me', { credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.sucesso) {
          clearSessionBanner();
        }
      }
    } catch (_) {}
  }

  function overrideAdminFetch() {
    window.adminFetch = async (url, fallback = []) => {
      try {
        if (window.__adminSessionExpired) return fallback;
        const r = await fetch(url, { credentials: 'include' });
        if (r.status === 401) {
          handleUnauthorized('Sessão expirada. Faça login novamente.');
          throw new Error('HTTP 401');
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } catch (e) {
        console.warn('Admin fetch fallback', url, e);
        return fallback;
      }
    };

    window.adminPost = async (url, body) => {
      if (window.__adminSessionExpired) {
        throw new Error('Sessão expirada.');
      }
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body || {}),
      });
      if (r.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        throw new Error('HTTP 401');
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    };
  }

  let eventosReady = false;
  let orgReady = false;
  let admReady = false;
  let rankingReady = false;
  let logsReady = false;
  let sorteioReady = false;
  let sorteioAllRows = [];
  let sorteioEventos = [];
  let sorteioModalidades = [];
  let lastSumulaMatch = null;
  let lastSumulaContext = null;
  let sumulaTrapHandler = null;
  let sumulaBackdropHandler = null;
  let sumulaCards = [];
  let sumulaPlayersByTeam = { A: [], B: [] };

  overrideAdminFetch();

  // =====================
  // Eventos
  // =====================
  function setEvtMsg(text, isError) {
    const msg = document.getElementById('evtMsg');
    if (!msg) return;
    msg.textContent = text || '';
    msg.style.color = isError ? 'var(--danger)' : 'var(--muted)';
  }

  async function prefillOrgAdmin() {
    const orgInput = document.getElementById('evtOrgId');
    if (!orgInput) return;
    try {
      const res = await fetch('/auth/admin/me', { credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.sucesso) return;
      const orgId = data?.data?.organization?.id || data?.data?.admin?.organization_id;
      if (orgId) {
        orgInput.value = orgId;
        orgInput.readOnly = true;
      }
    } catch (_) {}
  }

  function formatDateAdmin(value) {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleDateString('pt-BR');
    } catch {
      return '-';
    }
  }

  async function loadEventosAdmin() {
    if (adminSessionExpired) return;
    const tbody = document.getElementById('evtTable');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="center muted" style="padding:16px;">Carregando...</td></tr>`;
    try {
      const res = await fetch('/eventos', { credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao carregar');
      const rows = data.data || [];
      const totalEl = document.getElementById('evtTotal');
      const abertoEl = document.getElementById('evtAbertos');
      const andamentoEl = document.getElementById('evtAndamento');
      const encerradoEl = document.getElementById('evtEncerrados');
      if (totalEl) totalEl.textContent = rows.length;
      if (abertoEl) abertoEl.textContent = rows.filter(r => r.status === 'ABERTO').length;
      if (andamentoEl) andamentoEl.textContent = rows.filter(r => r.status === 'EM_ANDAMENTO').length;
      if (encerradoEl) encerradoEl.textContent = rows.filter(r => r.status === 'ENCERRADO').length;
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="center muted" style="padding:16px;">Nenhum evento cadastrado.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(e => `
        <tr>
          <td>${e.id}</td>
          <td>${e.nome || '-'}</td>
          <td>${e.ano || '-'}</td>
          <td>${formatDateAdmin(e.data_inicio)}</td>
          <td>${formatDateAdmin(e.data_fim)}</td>
          <td>${e.status || '-'}</td>
          <td>${formatDateAdmin(e.criado_em)}</td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="center muted" style="padding:16px;">Falha ao carregar eventos.</td></tr>`;
    }
  }

  async function handleEventoSubmit(event) {
    event?.preventDefault();
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    setEvtMsg('');
    const nome = document.getElementById('evtNome')?.value?.trim();
    const ano = Number(document.getElementById('evtAno')?.value || 0);
    const dataInicio = document.getElementById('evtInicio')?.value || null;
    const dataFim = document.getElementById('evtFim')?.value || null;
    const status = document.getElementById('evtStatus')?.value || 'ABERTO';
    const organization_id = Number(document.getElementById('evtOrgId')?.value || 0);
    setHelpById('evtOrgId', null, organization_id ? '' : 'Organization obrigatoria.');
    setHelpById('evtNome', null, nome ? '' : 'Nome obrigatorio.');
    setHelpById('evtAno', null, ano ? '' : 'Ano obrigatorio.');

    if (!organization_id || !nome || !ano) {
      setEvtMsg('Preencha organization_id, nome e ano.', true);
      scrollToFirstError(document.getElementById('evtForm'));
      return;
    }

    const submitBtn = document.getElementById('evtSubmit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando...';
    }

    try {
      const res = await fetch('/eventos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ organization_id, nome, ano, data_inicio: dataInicio, data_fim: dataFim, status })
      });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.sucesso) {
        setEvtMsg(data?.erro?.mensagem || data?.message || 'Erro ao salvar evento.', true);
        return;
      }
      if (window.SuccessFeedback) {
        SuccessFeedback.show({ title: 'Evento criado', message: 'Evento cadastrado com sucesso.' });
      } else {
        safeShowToast({ type: 'success', title: 'Evento criado', message: 'Evento cadastrado com sucesso.' });
      }
      document.getElementById('evtForm')?.reset();
      prefillOrgAdmin();
      loadEventosAdmin();
    } catch (_) {
      setEvtMsg('Nao foi possivel salvar o evento.', true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar evento';
      }
    }
  }

  function bindEventosTab() {
    if (eventosReady) return;
    eventosReady = true;
    const form = document.getElementById('evtForm');
    const resetBtn = document.getElementById('evtReset');
    if (form) form.addEventListener('submit', handleEventoSubmit);
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        form?.reset();
        setEvtMsg('');
        prefillOrgAdmin();
      });
    }
    prefillOrgAdmin();
    loadEventosAdmin();
  }

  // =====================
  // Organizadores
  // =====================
  let orgAdmins = [];
  let orgEditingId = null;

  function orgOpenModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
  }
  function orgCloseModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  }
  function orgSetHelp(inputId, helpId, msg) {
    const input = document.getElementById(inputId);
    const help = document.getElementById(helpId);
    if (!input) return;
    if (help) help.textContent = msg || '';
    input.classList.toggle('input-erro', Boolean(msg));
  }
  function orgFormatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
  function isOrganizador(admin) {
    return String(admin.role || '').toUpperCase() === 'STAFF';
  }
  function renderOrganizadores(list) {
    const tbody = document.getElementById('orgTable');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="center muted" style="padding:18px;">Nenhum organizador encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(a => `
      <tr>
        <td>${a.nome}</td>
        <td>${a.email}</td>
        <td>Organizador</td>
        <td>${a.ativo ? 'Sim' : 'Nao'}</td>
        <td>${orgFormatDate(a.criado_em)}</td>
        <td>
          <button class="btn-link" onclick="orgOpenEdit(${a.id})">Editar</button>
          <button class="btn-link" onclick="orgToggleAtivo(${a.id})">${a.ativo ? 'Desativar' : 'Ativar'}</button>
          <button class="btn-link" onclick="orgDeleteOrganizador(${a.id})">Excluir</button>
        </td>
      </tr>
    `).join('');
  }

  async function fetchOrganizadores() {
    if (adminSessionExpired) return;
    safeShowLoading(true);
    try {
      const res = await fetch('/admins', { credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro');
      orgAdmins = (data.data || []).filter(isOrganizador);
      const totalEl = document.getElementById('orgTotal');
      const ativosEl = document.getElementById('orgAtivos');
      const inativosEl = document.getElementById('orgInativos');
      if (totalEl) totalEl.textContent = orgAdmins.length;
      if (ativosEl) ativosEl.textContent = orgAdmins.filter(a => a.ativo).length;
      if (inativosEl) inativosEl.textContent = orgAdmins.filter(a => !a.ativo).length;
      applyOrgFilters();
    } catch (err) {
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao carregar organizadores' });
    } finally {
      safeShowLoading(false);
    }
  }

  function applyOrgFilters() {
    const search = document.getElementById('orgSearchInput')?.value?.trim().toLowerCase() || '';
    const ativo = document.getElementById('orgActiveFilter')?.value || '';
    let list = [...orgAdmins];
    if (search) list = list.filter(a => a.nome.toLowerCase().includes(search) || a.email.toLowerCase().includes(search));
    if (ativo !== '') list = list.filter(a => String(a.ativo ? 1 : 0) === ativo);
    renderOrganizadores(list);
  }

  async function createOrganizadorAdmin() {
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    const nome = document.getElementById('orgCreateNome')?.value?.trim() || '';
    const email = document.getElementById('orgCreateEmail')?.value?.trim() || '';
    const senha = document.getElementById('orgCreateSenha')?.value?.trim() || '';
    let ok = true;
    orgSetHelp('orgCreateNome', 'orgCreateNomeHelp', nome ? '' : 'Nome obrigatorio.');
    const emailOk = validateEmailField(email, 'orgCreateEmailHelp', 'orgCreateEmail');
    orgSetHelp('orgCreateSenha', 'orgCreateSenhaHelp', senha.length >= 8 ? '' : 'Senha deve ter ao menos 8 caracteres.');
    if (!nome || !emailOk || senha.length < 8) ok = false;
    if (!ok) {
      scrollToFirstError(document.getElementById('orgCreateForm'));
      return;
    }

    safeShowLoading(true);
    try {
      const res = await fetch('/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nome, email, senha, role: 'STAFF' })
      });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao criar');
      safeShowToast({ type: 'success', title: 'Organizador criado', message: 'Cadastro realizado com sucesso.' });
      orgCloseModal('orgCreateModal');
      fetchOrganizadores();
    } catch (err) {
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao criar organizador' });
    } finally {
      safeShowLoading(false);
    }
  }

  function orgOpenEdit(id) {
    const admin = orgAdmins.find(a => a.id === id);
    if (!admin) return;
    orgEditingId = id;
    document.getElementById('orgEditNome').value = admin.nome;
    document.getElementById('orgEditEmail').value = admin.email;
    document.getElementById('orgEditAtivo').value = admin.ativo ? '1' : '0';
    document.getElementById('orgEditSenha').value = '';
    orgOpenModal('orgEditModal');
  }

  function orgResetTempPassword() {
    const pass = Math.random().toString(36).slice(-10) + 'A1';
    document.getElementById('orgEditSenha').value = pass;
    safeShowToast({ type: 'info', title: 'Senha temporaria', message: 'Uma senha temporaria foi gerada.' });
  }

  async function saveEditOrganizadorAdmin() {
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    const nome = document.getElementById('orgEditNome').value.trim();
    const ativo = document.getElementById('orgEditAtivo').value === '1';
    const senha = document.getElementById('orgEditSenha').value.trim();
    orgSetHelp('orgEditNome', 'orgEditNomeHelp', nome ? '' : 'Nome obrigatorio.');
    orgSetHelp('orgEditSenha', 'orgEditSenhaHelp', senha && senha.length < 8 ? 'Senha deve ter ao menos 8 caracteres.' : '');
    if (!nome) return;
    if (senha && senha.length < 8) return;

    safeShowLoading(true);
    try {
      const res = await fetch(`/admins/${orgEditingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nome, ...(senha ? { senha } : {}) })
      });
      const data = await res.json();
      if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao atualizar');

      await fetch(`/admins/${orgEditingId}/ativar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ativo })
      });
      safeShowToast({ type: 'success', title: 'Organizador atualizado', message: 'Alteracoes salvas.' });
      orgCloseModal('orgEditModal');
      fetchOrganizadores();
    } catch (err) {
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao atualizar' });
    } finally {
      safeShowLoading(false);
    }
  }

  function orgToggleAtivo(id) {
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    const admin = orgAdmins.find(a => a.id === id);
    if (!admin) return;
    safeConfirm({
      title: admin.ativo ? 'Desativar organizador' : 'Ativar organizador',
      message: 'Digite CONFIRMAR para continuar.',
      confirmText: 'CONFIRMAR',
      onConfirm: async () => {
        safeShowLoading(true);
        try {
          const res = await fetch(`/admins/${id}/ativar`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ativo: !admin.ativo })
          });
          const data = await res.json();
          if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro');
          safeShowToast({ type: 'success', title: 'Atualizado', message: 'Status alterado.' });
          fetchOrganizadores();
        } catch (err) {
          safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao atualizar status' });
        } finally {
          safeShowLoading(false);
        }
      }
    });
  }

  function orgDeleteOrganizador(id) {
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    safeConfirm({
      title: 'Excluir organizador',
      message: 'Acao irreversivel. Digite CONFIRMAR para excluir.',
      confirmText: 'CONFIRMAR',
      onConfirm: async () => {
        safeShowLoading(true);
        try {
          const res = await fetch(`/admins/${id}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          const data = await res.json();
          if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao excluir');
          safeShowToast({ type: 'success', title: 'Organizador removido', message: 'Registro excluido.' });
          fetchOrganizadores();
        } catch (err) {
          safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao excluir' });
        } finally {
          safeShowLoading(false);
        }
      }
    });
  }

  function bindOrganizadoresTab() {
    if (orgReady) return;
    orgReady = true;
    document.getElementById('orgApplyFilter')?.addEventListener('click', applyOrgFilters);
    document.getElementById('orgOpenCreate')?.addEventListener('click', () => orgOpenModal('orgCreateModal'));
    fetchOrganizadores();
  }

  // =====================
  // Administradores
  // =====================
  let admList = [];
  let admEditingId = null;

  function admOpenModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
  }
  function admCloseModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  }
  function admSetHelp(inputId, helpId, msg) {
    const input = document.getElementById(inputId);
    const help = document.getElementById(helpId);
    if (!input) return;
    if (help) help.textContent = msg || '';
    input.classList.toggle('input-erro', Boolean(msg));
  }
  function admFormatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
  function renderAdmins(list) {
    const tbody = document.getElementById('admTable');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="center muted" style="padding:18px;">Nenhum administrador encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(a => `
      <tr>
        <td>${a.nome}</td>
        <td>${a.email}</td>
        <td>${a.role}</td>
        <td>${a.ativo ? 'Sim' : 'Nao'}</td>
        <td>${admFormatDate(a.criado_em)}</td>
        <td>
          <button class="btn-link" onclick="admOpenEdit(${a.id})">Editar</button>
          <button class="btn-link" onclick="admToggleAtivo(${a.id})">${a.ativo ? 'Desativar' : 'Ativar'}</button>
          <button class="btn-link" onclick="admDelete(${a.id})">Excluir</button>
        </td>
      </tr>
    `).join('');
  }

  async function fetchAdmins() {
    if (adminSessionExpired) return;
    safeShowLoading(true);
    try {
      const res = await fetch('/admins', { credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro');
      admList = data.data || [];
      applyAdmFilters();
    } catch (err) {
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao carregar admins' });
    } finally {
      safeShowLoading(false);
    }
  }

  function applyAdmFilters() {
    const search = document.getElementById('admSearchInput')?.value?.trim().toLowerCase() || '';
    const role = document.getElementById('admRoleFilter')?.value || '';
    const ativo = document.getElementById('admActiveFilter')?.value || '';
    let list = [...admList];
    if (search) list = list.filter(a => a.nome.toLowerCase().includes(search) || a.email.toLowerCase().includes(search));
    if (role) list = list.filter(a => a.role === role);
    if (ativo !== '') list = list.filter(a => String(a.ativo ? 1 : 0) === ativo);
    renderAdmins(list);
  }

  async function createAdminUser() {
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    const nome = document.getElementById('admCreateNome').value.trim();
    const email = document.getElementById('admCreateEmail').value.trim();
    const senha = document.getElementById('admCreateSenha').value.trim();
    const role = document.getElementById('admCreateRole').value;
    let ok = true;
    admSetHelp('admCreateNome', 'admCreateNomeHelp', nome ? '' : 'Nome obrigatorio.');
    const emailOk = validateEmailField(email, 'admCreateEmailHelp', 'admCreateEmail');
    admSetHelp('admCreateSenha', 'admCreateSenhaHelp', senha.length >= 8 ? '' : 'Senha deve ter ao menos 8 caracteres.');
    if (!nome || !emailOk || senha.length < 8) ok = false;
    if (!ok) {
      scrollToFirstError(document.getElementById('admCreateForm'));
      return;
    }

    safeShowLoading(true);
    try {
      const res = await fetch('/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nome, email, senha, role })
      });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao criar');
      safeShowToast({ type: 'success', title: 'Administrador criado', message: 'Cadastro realizado com sucesso.' });
      admCloseModal('admCreateModal');
      fetchAdmins();
    } catch (err) {
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao criar admin' });
    } finally {
      safeShowLoading(false);
    }
  }

  function admOpenEdit(id) {
    const admin = admList.find(a => a.id === id);
    if (!admin) return;
    admEditingId = id;
    document.getElementById('admEditNome').value = admin.nome;
    document.getElementById('admEditEmail').value = admin.email;
    document.getElementById('admEditRole').value = admin.role;
    document.getElementById('admEditAtivo').value = admin.ativo ? '1' : '0';
    document.getElementById('admEditSenha').value = '';
    admOpenModal('admEditModal');
  }

  function admResetTempPassword() {
    const pass = Math.random().toString(36).slice(-10) + 'A1';
    document.getElementById('admEditSenha').value = pass;
    safeShowToast({ type: 'info', title: 'Senha temporaria', message: 'Uma senha temporaria foi gerada.' });
  }

  async function saveEditAdminUser() {
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    const nome = document.getElementById('admEditNome').value.trim();
    const role = document.getElementById('admEditRole').value;
    const ativo = document.getElementById('admEditAtivo').value === '1';
    const senha = document.getElementById('admEditSenha').value.trim();
    admSetHelp('admEditNome', 'admEditNomeHelp', nome ? '' : 'Nome obrigatorio.');
    admSetHelp('admEditSenha', 'admEditSenhaHelp', senha && senha.length < 8 ? 'Senha deve ter ao menos 8 caracteres.' : '');
    if (!nome) return;
    if (senha && senha.length < 8) return;

    safeShowLoading(true);
    try {
      const res = await fetch(`/admins/${admEditingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nome, role, ...(senha ? { senha } : {}) })
      });
      const data = await res.json();
      if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao atualizar');

      await fetch(`/admins/${admEditingId}/ativar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ativo })
      });
      safeShowToast({ type: 'success', title: 'Admin atualizado', message: 'Alteracoes salvas.' });
      admCloseModal('admEditModal');
      fetchAdmins();
    } catch (err) {
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao atualizar' });
    } finally {
      safeShowLoading(false);
    }
  }

  function admToggleAtivo(id) {
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    const admin = admList.find(a => a.id === id);
    if (!admin) return;
    safeConfirm({
      title: admin.ativo ? 'Desativar admin' : 'Ativar admin',
      message: 'Digite CONFIRMAR para continuar.',
      confirmText: 'CONFIRMAR',
      onConfirm: async () => {
        safeShowLoading(true);
        try {
          const res = await fetch(`/admins/${id}/ativar`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ativo: !admin.ativo })
          });
          const data = await res.json();
          if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro');
          safeShowToast({ type: 'success', title: 'Atualizado', message: 'Status alterado.' });
          fetchAdmins();
        } catch (err) {
          safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao atualizar status' });
        } finally {
          safeShowLoading(false);
        }
      }
    });
  }

  function admDelete(id) {
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    safeConfirm({
      title: 'Excluir administrador',
      message: 'Acao irreversivel. Digite CONFIRMAR para excluir.',
      confirmText: 'CONFIRMAR',
      onConfirm: async () => {
        safeShowLoading(true);
        try {
          const res = await fetch(`/admins/${id}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          const data = await res.json();
          if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao excluir');
          safeShowToast({ type: 'success', title: 'Admin removido', message: 'Registro excluido.' });
          fetchAdmins();
        } catch (err) {
          safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao excluir' });
        } finally {
          safeShowLoading(false);
        }
      }
    });
  }

  function bindAdminsTab() {
    if (admReady) return;
    admReady = true;
    document.getElementById('admApplyFilter')?.addEventListener('click', applyAdmFilters);
    document.getElementById('admOpenCreate')?.addEventListener('click', () => admOpenModal('admCreateModal'));
    fetchAdmins();
  }

  // =====================
  // Sorteio (com evento)
  // =====================
  function setSelectOptionsByList(select, items, placeholder) {
    if (!select) return;
    const current = select.value;
    const unique = [];
    const seen = new Set();
    items.forEach((item) => {
      if (!item || seen.has(String(item.value))) return;
      seen.add(String(item.value));
      unique.push(item);
    });
    select.innerHTML = `<option value="">${placeholder}</option>` + unique.map(
      (item) => `<option value="${item.value}">${item.label}</option>`
    ).join('');
    if (current) select.value = current;
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

  function mapSorteioRow(j) {
    const equipeA = cleanLabel(j.equipeA || j.equipe_a || j.equipeA_nome || '-');
    const equipeB = cleanLabel(j.equipeB || j.equipe_b || j.equipeB_nome || '-');
    const hora = cleanLabel(j.hora || j.hora_oficial || j.hora_texto || '');
    const jogo = cleanLabel(j.jogo || j.numero_jogo || j.jogo_label || `Jogo ${j.ordem || j.id || ''}`);
    const chave = cleanLabel(j.chave || j.chave_grupo || 'CH A');
    return {
      ...j,
      equipeA,
      equipeB,
      hora,
      jogo,
      chave,
      status: j.status || 'NAO_INICIADO',
    };
  }

  function renderSorteioStatus(status) {
    const raw = String(status || '').toUpperCase();
    const isDone = raw === 'DONE' || raw === 'FINALIZADO' || raw === 'ENCERRADO';
    const isLive = raw === 'EM_ANDAMENTO' || raw === 'LIVE';
    const cls = isDone ? 'pill done' : isLive ? 'pill warning' : 'pill';
    const label = isDone ? 'Finalizado' : isLive ? 'Em andamento' : 'Agendado';
    return `<span class="${cls}">${label}</span>`;
  }

  function renderSorteioTabela() {
    const tbody = document.getElementById('sorteioBody');
    if (!tbody) return;
    if (!sorteioRows.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Escolha filtros e clique em \"Gerar tabela\".</td></tr>';
      return;
    }
    tbody.innerHTML = sorteioRows.map((j) => `
      <tr class="${normalizeSorteioStatus(j.status) === 'DONE' ? 'is-done' : ''}">
        <td class="sorteio-col-center">${j.ordem ?? '-'}</td>
        <td class="sorteio-col-center">${escapeHtml(j.jogo || '-')}</td>
        <td class="sorteio-col-center">${escapeHtml(j.hora || 'A seguir')}</td>
        <td class="sorteio-col-center"><span class="sorteio-key-badge">${escapeHtml(j.chave || '-')}</span></td>
        <td><span class="sorteio-team-name" title="${escapeHtml(j.equipeA || '-')}">${escapeHtml(j.equipeA || '-')}</span></td>
        <td class="placar">X</td>
        <td><span class="sorteio-team-name" title="${escapeHtml(j.equipeB || '-')}">${escapeHtml(j.equipeB || '-')}</span></td>
        <td class="sorteio-col-center">${renderSorteioStatus(j.status)}</td>
        <td class="sorteio-col-center"><button class="btn-outline btn-sm" type="button" onclick="openSumulaMatchById('${j.id}')">Súmula</button></td>
      </tr>
    `).join('');
  }

  function syncSorteioChaveOptions() {
    const select = document.getElementById('sorteioChave');
    if (!select) return;
    const current = select.value;
    const chaves = Array.from(new Set(sorteioAllRows.map((j) => String(j.chave || 'CH A'))))
      .sort((a, b) => a.localeCompare(b));
    select.innerHTML = '<option value="">Todas</option>' + chaves.map((chave) => `<option value="${chave}">${chave}</option>`).join('');
    if (current && chaves.includes(current)) {
      select.value = current;
    }
  }

  function renderSorteioChavesTabela() {
    const tbody = document.getElementById('sorteioChavesBody');
    if (!tbody) return;
    if (!sorteioAllRows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="center muted" style="padding:16px;">Gere o sorteio para exibir as chaves.</td></tr>';
      return;
    }
    const map = new Map();
    sorteioAllRows.forEach((j) => {
      const chave = String(j.chave || 'CH A');
      if (!map.has(chave)) {
        map.set(chave, { chave, equipes: new Set(), total: 0, done: 0 });
      }
      const item = map.get(chave);
      item.total += 1;
      if (normalizeSorteioStatus(j.status) === 'DONE') item.done += 1;
      if (j.equipeA && j.equipeA !== '-') item.equipes.add(String(j.equipeA).trim());
      if (j.equipeB && j.equipeB !== '-') item.equipes.add(String(j.equipeB).trim());
    });
    const rows = Array.from(map.values()).sort((a, b) => a.chave.localeCompare(b.chave));
    const selectedChave = document.getElementById('sorteioChave')?.value || '';
    tbody.innerHTML = rows.map((r) => {
      const teamNames = Array.from(r.equipes).sort((a, b) => a.localeCompare(b));
      const preview = teamNames.slice(0, 3).join(' • ');
      const shortPreview = teamNames.length > 3 ? `${preview}...` : preview;
      const progress = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
      const isActive = selectedChave && selectedChave === r.chave;
      return `
        <tr class="sorteio-chave-row${isActive ? ' is-active' : ''}">
          <td><span class="sorteio-key-badge">${escapeHtml(r.chave)}</span></td>
          <td>
            <div class="sorteio-equipes-cell">
              <span class="sorteio-num-chip">${r.equipes.size}</span>
              <span class="sorteio-equipes-preview" title="${escapeHtml(teamNames.join(', '))}">${escapeHtml(shortPreview || '-')}</span>
            </div>
          </td>
          <td class="sorteio-col-center">${r.total}</td>
          <td>
            <div class="sorteio-progress-wrap">
              <div class="sorteio-progress-bar"><span style="width:${progress}%"></span></div>
              <small>${r.done}/${r.total}</small>
            </div>
          </td>
          <td class="sorteio-col-center"><button class="${isActive ? 'btn-primary' : 'btn-outline'} btn-sm" type="button" onclick="selectSorteioChave('${r.chave}')">${isActive ? 'Filtrando' : 'Ver jogos'}</button></td>
        </tr>
      `;
    }).join('');
  }

  function updateSorteioTitle() {
    const title = document.getElementById('sorteioTituloModalidade');
    const eventoId = document.getElementById('sorteioEvento')?.value;
    const modalidadeId = document.getElementById('sorteioModalidade')?.value;
    if (!title) return;
    const evento = sorteioEventos.find(e => String(e.id) === String(eventoId));
    const modalidade = sorteioModalidades.find(m => String(m.id) === String(modalidadeId));
    if (evento && modalidade) {
      title.textContent = `Tabela de sorteio - ${modalidade.nome || modalidade.titulo} - ${evento.nome || 'Evento'} ${evento.ano ? `(${evento.ano})` : ''}`;
    } else if (evento) {
      title.textContent = `Tabela de sorteio - Todas as modalidades - ${evento.nome || 'Evento'} ${evento.ano ? `(${evento.ano})` : ''}`;
    } else {
      title.textContent = 'Tabela de sorteio';
    }
  }

  function updateSumulaChaveLabel(chaveFromContext = null) {
    const chave = chaveFromContext || document.getElementById('sorteioChave')?.value || '-';
    const labelA = document.getElementById('sumulaChaveLabel');
    const labelB = document.getElementById('sumulaModalChaveLabel');
    if (labelA) labelA.textContent = chave || '-';
    if (labelB) labelB.textContent = chave || '-';
  }

  function setSumulaMsg(message, type = 'error') {
    const box = document.getElementById('sumulaModalMsg');
    if (!box) return;
    box.className = 'form-msg show ' + (type === 'success' ? 'success' : 'error');
    box.textContent = message || '';
  }

  function clearSumulaMsg() {
    const box = document.getElementById('sumulaModalMsg');
    if (!box) return;
    box.className = 'form-msg';
    box.textContent = '';
  }

  function setSumulaCardMsg(message, type = 'error') {
    const box = document.getElementById('sumulaCardMsg');
    if (!box) return;
    if (!message) {
      box.className = 'form-msg';
      box.textContent = '';
      return;
    }
    box.className = 'form-msg show ' + (type === 'success' ? 'success' : 'error');
    box.textContent = message;
  }

  function normalizeSumulaName(value) {
    return String(value || '')
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeShirtValue(value) {
    const digits = String(value ?? '')
      .replace(/\D/g, '')
      .trim();
    if (!digits) return '';
    return digits.slice(0, 4);
  }

  function normalizePlayerEntry(player) {
    if (typeof player === 'string') {
      const nome = normalizeSumulaName(player);
      return nome ? { nome, numero_camisa: '' } : null;
    }
    if (!player || typeof player !== 'object') return null;
    const nome = normalizeSumulaName(player.nome || player.player || '');
    if (!nome) return null;
    return {
      nome,
      numero_camisa: normalizeShirtValue(
        player.numero_camisa ?? player.shirt ?? player.camisa ?? ''
      ),
    };
  }

  function toPlayerLabel(player) {
    if (!player) return '';
    return player.numero_camisa
      ? `${player.nome} (#${player.numero_camisa})`
      : player.nome;
  }

  function buildSumulaPlayersPayload() {
    const normalizeList = (list) => (list || [])
      .map((player) => normalizePlayerEntry(player))
      .filter(Boolean)
      .map((player) => ({
        nome: player.nome,
        numero_camisa: player.numero_camisa || null,
      }));

    return {
      A: normalizeList(sumulaPlayersByTeam.A),
      B: normalizeList(sumulaPlayersByTeam.B),
    };
  }

  function getTeamLabelByCode(code) {
    return code === 'B' ? 'Equipe B' : 'Equipe A';
  }

  function cardTypeLabel(type) {
    return String(type || '').toUpperCase() === 'RED' ? 'Vermelho' : 'Amarelo';
  }

  function countCardsBy(teamCode, type) {
    return sumulaCards.filter((card) =>
      String(card.team || '').toUpperCase() === teamCode &&
      String(card.type || '').toUpperCase() === type
    ).length;
  }

  function setTextById(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value ?? '');
  }

  function renderSumulaCardCounters() {
    const teamAName = normalizeSumulaName(document.getElementById('sumulaEquipeAName')?.textContent || 'Equipe A');
    const teamBName = normalizeSumulaName(document.getElementById('sumulaEquipeBName')?.textContent || 'Equipe B');

    setTextById('sumulaCountATeam', teamAName || 'Equipe A');
    setTextById('sumulaCountBTeam', teamBName || 'Equipe B');
    setTextById('sumulaCountAYellow', countCardsBy('A', 'YELLOW'));
    setTextById('sumulaCountARed', countCardsBy('A', 'RED'));
    setTextById('sumulaCountBYellow', countCardsBy('B', 'YELLOW'));
    setTextById('sumulaCountBRed', countCardsBy('B', 'RED'));
  }

  function populateCardPlayerSelect() {
    const teamSelect = document.getElementById('sumulaCardTeam');
    const playerSelect = document.getElementById('sumulaCardPlayer');
    if (!teamSelect || !playerSelect) return;
    const team = String(teamSelect.value || 'A').toUpperCase();
    const players = (sumulaPlayersByTeam[team] || [])
      .map((player) => normalizePlayerEntry(player))
      .filter(Boolean);
    playerSelect.innerHTML = '<option value="">Jogador</option>' + players.map((player) =>
      `<option value="${escapeHtml(player.nome)}" data-camisa="${escapeHtml(player.numero_camisa || '')}">${escapeHtml(toPlayerLabel(player))}</option>`
    ).join('');
    applyShirtFromSelectedPlayer();
  }

  function applyShirtFromSelectedPlayer() {
    const playerSelect = document.getElementById('sumulaCardPlayer');
    const shirtInput = document.getElementById('sumulaCardShirt');
    if (!playerSelect || !shirtInput) return;
    const selected = playerSelect.selectedOptions?.[0];
    shirtInput.value = normalizeShirtValue(selected?.dataset?.camisa || '');
  }

  function updateSumulaPlayerShirt(teamCode, index, value) {
    const team = String(teamCode || '').toUpperCase() === 'B' ? 'B' : 'A';
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0) return;
    const list = sumulaPlayersByTeam[team] || [];
    const player = normalizePlayerEntry(list[idx]);
    if (!player) return;
    player.numero_camisa = normalizeShirtValue(value);
    list[idx] = player;

    const selectedTeam = String(document.getElementById('sumulaCardTeam')?.value || 'A').toUpperCase();
    if (selectedTeam === team) {
      populateCardPlayerSelect();
    }
  }

  function normalizeSumulaCardShirtInput() {
    const input = document.getElementById('sumulaCardShirt');
    if (!input) return;
    input.value = normalizeShirtValue(input.value);
  }

  function renderSumulaPlayers() {
    const listA = document.getElementById('sumulaPlayersAList');
    const listB = document.getElementById('sumulaPlayersBList');
    const render = (el, players, teamCode) => {
      if (!el) return;
      if (!players.length) {
        el.innerHTML = '<div class="sumula-empty">Sem jogadores vinculados.</div>';
        return;
      }
      el.innerHTML = players
        .map((player) => normalizePlayerEntry(player))
        .filter(Boolean)
        .map((player, index) => `
          <div class="sumula-player-item">
            <div class="sumula-player-row">
              <div class="sumula-player-name">${escapeHtml(player.nome)}</div>
              <div class="sumula-player-shirt">
                <label>No camisa</label>
                <input type="text"
                       inputmode="numeric"
                       maxlength="4"
                       value="${escapeHtml(player.numero_camisa || '')}"
                       oninput="updateSumulaPlayerShirt('${teamCode}', ${index}, this.value)"
                       placeholder="Opcional" />
              </div>
            </div>
          </div>
        `)
        .join('');
    };
    render(listA, sumulaPlayersByTeam.A || [], 'A');
    render(listB, sumulaPlayersByTeam.B || [], 'B');
  }

  function renderSumulaCards() {
    renderSumulaCardCounters();
    const list = document.getElementById('sumulaCardsList');
    if (!list) return;
    if (!sumulaCards.length) {
      list.innerHTML = '<div class="sumula-empty">Nenhum cartao lancado.</div>';
      return;
    }
    list.innerHTML = sumulaCards.map((card, index) => {
      const type = String(card.type || 'YELLOW').toUpperCase();
      const badgeClass = type === 'RED' ? 'red' : 'yellow';
      const minute = Number.isInteger(Number(card.minute)) ? `${card.minute}'` : '--';
      const teamLabel = getTeamLabelByCode(card.team);
      const note = normalizeSumulaName(card.note || '');
      const shirt = normalizeShirtValue(card.shirt || card.numero_camisa || '');
      return `
        <div class="sumula-card-item">
          <span class="sumula-card-badge ${badgeClass}">${cardTypeLabel(type)}</span>
          <div>
            <div><strong>${escapeHtml(card.player || "-")}</strong>${shirt ? ` <span class="sumula-card-team">#${escapeHtml(shirt)}</span>` : ""}</div>
            <div class="sumula-card-team">${escapeHtml(teamLabel)} - ${escapeHtml(minute)}${note ? ` - ${escapeHtml(note)}` : ""}</div>
          </div>
          <span class="sumula-card-team">${escapeHtml(type === "RED" ? "R" : "A")}</span>
          <button class="sumula-card-remove" type="button" onclick="removeSumulaCard(${index})">x</button>
        </div>
      `;
    }).join('');
  }

  function addSumulaCard() {
    const team = String(document.getElementById('sumulaCardTeam')?.value || 'A').toUpperCase();
    const player = normalizeSumulaName(document.getElementById('sumulaCardPlayer')?.value || '');
    const shirt = normalizeShirtValue(document.getElementById('sumulaCardShirt')?.value || '');
    const type = String(document.getElementById('sumulaCardType')?.value || 'YELLOW').toUpperCase();
    const minuteRaw = String(document.getElementById('sumulaCardMinute')?.value || '').trim();
    const note = normalizeSumulaName(document.getElementById('sumulaCardNote')?.value || '');

    if (!['A', 'B'].includes(team)) {
      setSumulaCardMsg('Selecione uma equipe.', 'error');
      return;
    }
    if (!player) {
      setSumulaCardMsg('Selecione um jogador.', 'error');
      return;
    }
    if (!['YELLOW', 'RED'].includes(type)) {
      setSumulaCardMsg('Tipo de cartao invalido.', 'error');
      return;
    }

    let minute = null;
    if (minuteRaw !== '') {
      const minuteNum = Number(minuteRaw);
      if (!Number.isInteger(minuteNum) || minuteNum < 0) {
        setSumulaCardMsg('Minuto invalido.', 'error');
        return;
      }
      minute = minuteNum;
    }

    sumulaCards.push({
      team,
      player: player.slice(0, 150),
      shirt: shirt || null,
      type,
      minute,
      note: note.slice(0, 120),
    });

    setSumulaCardMsg('Cartao adicionado.', 'success');
    const minuteInput = document.getElementById('sumulaCardMinute');
    const noteInput = document.getElementById('sumulaCardNote');
    const shirtInput = document.getElementById('sumulaCardShirt');
    if (minuteInput) minuteInput.value = '';
    if (noteInput) noteInput.value = '';
    if (shirtInput) shirtInput.value = '';
    renderSumulaCards();
  }

  function removeSumulaCard(index) {
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= sumulaCards.length) return;
    sumulaCards.splice(idx, 1);
    renderSumulaCards();
    setSumulaCardMsg('');
  }

  async function loadSumulaDetails(matchId) {
    const detailsUrl = `/sumulas/jogos/${matchId}/detalhes`;
    try {
      const res = await fetch(detailsUrl, { credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized('Sessao expirada. Faca login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || 'Erro ao carregar detalhes.');
      sumulaPlayersByTeam = {
        A: (data.jogadoresA || []).map((player) => normalizePlayerEntry(player)).filter(Boolean),
        B: (data.jogadoresB || []).map((player) => normalizePlayerEntry(player)).filter(Boolean),
      };
      sumulaCards = Array.isArray(data.cartoes)
        ? data.cartoes.map((card) => ({
            team: String(card.team || '').toUpperCase() === 'B' ? 'B' : 'A',
            player: normalizeSumulaName(card.player || ''),
            shirt: normalizeShirtValue(card.shirt || card.numero_camisa || card.camisa || ''),
            type: String(card.type || '').toUpperCase() === 'RED' ? 'RED' : 'YELLOW',
            minute: Number.isInteger(Number(card.minute)) ? Number(card.minute) : null,
            note: normalizeSumulaName(card.note || ''),
          })).filter((card) => card.player)
        : [];

      const arbitro = document.getElementById('sumulaArbitroNome');
      const mesario = document.getElementById('sumulaMesarioNome');
      if (arbitro) arbitro.value = normalizeSumulaName(data.match?.arbitro_nome || '');
      if (mesario) mesario.value = normalizeSumulaName(data.match?.mesario_nome || '');

      populateCardPlayerSelect();
      renderSumulaPlayers();
      renderSumulaCards();
    } catch (_) {
      sumulaPlayersByTeam = { A: [], B: [] };
      sumulaCards = [];
      populateCardPlayerSelect();
      renderSumulaPlayers();
      renderSumulaCards();
      setSumulaCardMsg('Nao foi possivel carregar jogadores/cartoes.', 'error');
    }
  }

  function updateObsCounter() {
    const obs = document.getElementById('sumulaObs');
    const counter = document.getElementById('sumulaObsCounter');
    if (!obs || !counter) return;
    counter.textContent = `${String(obs.value || '').length}/255`;
  }

  function toggleWinnerSideField() {
    const modal = document.getElementById('sumulaModal');
    const wrap = document.getElementById('sumulaWinnerWrap');
    const winner = document.getElementById('sumulaWinnerSide');
    const wo = document.getElementById('sumulaWo');
    const scoreA = Number(document.getElementById('sumulaScoreA')?.value || 0);
    const scoreB = Number(document.getElementById('sumulaScoreB')?.value || 0);
    const fase = String(modal?.dataset.fase || '').toUpperCase();
    const isKnockout = fase !== 'GRUPOS';
    const tied = scoreA === scoreB;
    const shouldShow = isKnockout && tied && !(wo?.checked);
    if (wrap) wrap.classList.toggle('hidden', !shouldShow);
    if (!shouldShow && winner) winner.value = '';
  }

  function normalizeSorteioStatus(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'done' || s === 'finalizado' || s === 'encerrado') return 'DONE';
    return 'PENDING';
  }

  function openSumulaModal(match) {
    if (!match) return;
    const modal = document.getElementById('sumulaModal');
    if (!modal) return;
    clearSumulaMsg();
    modal.classList.remove('hidden');
    modal.dataset.matchId = match.id;
    modal.dataset.fase = String(match.fase || 'GRUPOS').toUpperCase();
    lastSumulaMatch = match;
    lastSumulaContext = {
      modalidade_id: match.modalidade_id || document.getElementById('sorteioModalidade')?.value,
      sexo: match.sexo || document.getElementById('sorteioSexo')?.value,
      chave: match.chave || document.getElementById('sorteioChave')?.value || 'CH A',
    };

    const title = document.getElementById('sumulaModalTitle');
    const equipeA = document.getElementById('sumulaEquipeAName');
    const equipeB = document.getElementById('sumulaEquipeBName');
    const meta = document.getElementById('sumulaMatchMeta');
    const scoreA = document.getElementById('sumulaScoreA');
    const scoreB = document.getElementById('sumulaScoreB');
    const wo = document.getElementById('sumulaWo');
    const obs = document.getElementById('sumulaObs');
    const winnerSide = document.getElementById('sumulaWinnerSide');
    const arbitro = document.getElementById('sumulaArbitroNome');
    const mesario = document.getElementById('sumulaMesarioNome');

    const modalidade = sorteioModalidades.find((m) => String(m.id) === String(match.modalidade_id));
    const nomeMod = modalidade?.nome || modalidade?.titulo || 'Modalidade';
    const fase = String(match.fase || 'GRUPOS').toUpperCase();
    if (title) {
      title.textContent = `Sumula - ${nomeMod} - ${fase} - ${match.chave || '-'} - Jogo #${match.numero_jogo || match.jogo || match.id}`;
    }
    if (equipeA) equipeA.textContent = match.equipeA || match.equipe_a || '-';
    if (equipeB) equipeB.textContent = match.equipeB || match.equipe_b || '-';
    if (meta) meta.textContent = `Sexo ${match.sexo || '-'} - Ordem ${match.ordem || '-'}`;
    if (scoreA) scoreA.value = match.placar_a ?? '';
    if (scoreB) scoreB.value = match.placar_b ?? '';
    if (wo) wo.checked = Boolean(match.wo);
    if (obs) obs.value = match.observacoes || '';
    if (arbitro) arbitro.value = normalizeSumulaName(match.arbitro_nome || '');
    if (mesario) mesario.value = normalizeSumulaName(match.mesario_nome || '');
    if (winnerSide) {
      winnerSide.value = '';
      if (winnerSide.options[1]) winnerSide.options[1].textContent = equipeA?.textContent || 'Equipe A';
      if (winnerSide.options[2]) winnerSide.options[2].textContent = equipeB?.textContent || 'Equipe B';
    }

    sumulaCards = [];
    sumulaPlayersByTeam = { A: [], B: [] };
    const cardShirt = document.getElementById('sumulaCardShirt');
    if (cardShirt) cardShirt.value = '';
    setSumulaCardMsg('');
    populateCardPlayerSelect();
    renderSumulaPlayers();
    renderSumulaCards();

    toggleSumulaWo();
    updateObsCounter();
    updateSumulaChaveLabel(lastSumulaContext.chave);
    attachSumulaFocusTrap();
    refreshSumulaStandings();
    loadSumulaDetails(match.id);
    scoreA?.focus();
  }

  function closeSumulaModal() {
    const modal = document.getElementById('sumulaModal');
    if (!modal) return;
    modal.classList.add('hidden');
    clearSumulaMsg();
    detachSumulaFocusTrap();
  }

  function attachSumulaFocusTrap() {
    const modal = document.getElementById('sumulaModal');
    if (!modal) return;
    const focusable = Array.from(modal.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    sumulaTrapHandler = (e) => {
      if (e.key === 'Escape') {
        closeSumulaModal();
      }
      if (e.key !== 'Tab') return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    modal.addEventListener('keydown', sumulaTrapHandler);
    sumulaBackdropHandler = (e) => {
      if (e.target === modal) closeSumulaModal();
    };
    modal.addEventListener('mousedown', sumulaBackdropHandler);
  }

  function detachSumulaFocusTrap() {
    const modal = document.getElementById('sumulaModal');
    if (!modal) return;
    if (sumulaTrapHandler) {
      modal.removeEventListener('keydown', sumulaTrapHandler);
      sumulaTrapHandler = null;
    }
    if (sumulaBackdropHandler) {
      modal.removeEventListener('mousedown', sumulaBackdropHandler);
      sumulaBackdropHandler = null;
    }
  }

  function toggleSumulaWo() {
    const wo = document.getElementById('sumulaWo');
    const scoreA = document.getElementById('sumulaScoreA');
    const scoreB = document.getElementById('sumulaScoreB');
    if (!wo || !scoreA || !scoreB) return;
    const disabled = wo.checked;
    scoreA.disabled = disabled;
    scoreB.disabled = disabled;
    scoreA.classList.remove('input-erro');
    scoreB.classList.remove('input-erro');
    if (disabled) {
      scoreA.value = '';
      scoreB.value = '';
    }
    toggleWinnerSideField();
  }

  function renderStandingsRows(rows, highlightTeams = new Set()) {
    if (!rows.length) {
      return '<tr><td colspan="10" class="center muted" style="padding:16px;">Sem dados para esta chave.</td></tr>';
    }
    return rows.map((r, idx) => {
      const isLeader = idx === 0;
      const isHighlight = highlightTeams.has(String(r.equipe || '').trim());
      return `
        <tr class="${isHighlight ? 'sumula-highlight' : ''}">
          <td>${idx + 1}</td>
          <td class="${isLeader ? 'sumula-leader' : ''}">${r.equipe}</td>
          <td>${r.pontos}</td>
          <td>${r.jogos}</td>
          <td>${r.vitorias}</td>
          <td>${r.empates}</td>
          <td>${r.derrotas}</td>
          <td>${r.pro}</td>
          <td>${r.contra}</td>
          <td>${r.saldo}</td>
        </tr>
      `;
    }).join('');
  }

  async function refreshSumulaStandings() {
    const modalidadeId = lastSumulaContext?.modalidade_id || document.getElementById('sorteioModalidade')?.value;
    const sexo = lastSumulaContext?.sexo || document.getElementById('sorteioSexo')?.value;
    const chave = lastSumulaContext?.chave || document.getElementById('sorteioChave')?.value;
    const bodyMain = document.getElementById('sumulaStandingsBody');
    const bodyModal = document.getElementById('sumulaLiveStandingsBody');
    if (!bodyMain && !bodyModal) return;
    if (!modalidadeId || !sexo || !chave) {
      const emptyHtml = '<tr><td colspan="10" class="center muted" style="padding:16px;">Selecione evento, modalidade e chave.</td></tr>';
      if (bodyMain) bodyMain.innerHTML = emptyHtml;
      if (bodyModal) bodyModal.innerHTML = emptyHtml;
      return;
    }
    const loadingHtml = '<tr><td colspan="10" class="center muted" style="padding:16px;">Carregando...</td></tr>';
    if (bodyMain) bodyMain.innerHTML = loadingHtml;
    if (bodyModal) bodyModal.innerHTML = loadingHtml;
    updateSumulaChaveLabel(chave);
    try {
      const res = await fetch(`/sumulas/tabela?modalidade_id=${modalidadeId}&sexo=${sexo}&chave=${encodeURIComponent(chave)}`, { credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized('Sessao expirada. Faca login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || 'Erro');
      const rows = data.standings || [];
      const highlight = new Set();
      if (lastSumulaMatch) {
        highlight.add(String(lastSumulaMatch.equipeA || lastSumulaMatch.equipe_a || '').trim());
        highlight.add(String(lastSumulaMatch.equipeB || lastSumulaMatch.equipe_b || '').trim());
      }
      const html = renderStandingsRows(rows, highlight);
      if (bodyMain) bodyMain.innerHTML = html;
      if (bodyModal) bodyModal.innerHTML = html;
    } catch (_) {
      const errorHtml = '<tr><td colspan="10" class="center muted" style="padding:16px;">Falha ao carregar classificacao.</td></tr>';
      if (bodyMain) bodyMain.innerHTML = errorHtml;
      if (bodyModal) bodyModal.innerHTML = errorHtml;
    }
  }

  function findNextSumulaMatch() {
    if (!lastSumulaMatch) return null;
    const faseAtual = String(lastSumulaMatch.fase || '').toUpperCase();
    const chaveAtual = String(lastSumulaMatch.chave || '');
    const ordemAtual = Number(lastSumulaMatch.ordem || 0);
    const scope = sorteioRows.filter((r) =>
      String(r.chave || '') === chaveAtual &&
      String(r.fase || '').toUpperCase() === faseAtual
    );
    const pending = scope
      .filter((r) => Number(r.ordem || 0) > ordemAtual)
      .find((r) => normalizeSorteioStatus(r.status) !== 'DONE');
    if (pending) return pending;
    return scope.find((r) => normalizeSorteioStatus(r.status) !== 'DONE') || null;
  }

  async function saveSumulaModal(goNext = false) {
    const modal = document.getElementById('sumulaModal');
    if (!modal) return;
    const matchId = modal.dataset.matchId;
    const scoreA = document.getElementById('sumulaScoreA');
    const scoreB = document.getElementById('sumulaScoreB');
    const wo = document.getElementById('sumulaWo');
    const obs = document.getElementById('sumulaObs');
    const winnerSide = document.getElementById('sumulaWinnerSide');
    const arbitro = document.getElementById('sumulaArbitroNome');
    const mesario = document.getElementById('sumulaMesarioNome');
    if (!matchId) return;

    const payload = {
      placar_a: scoreA?.value ?? null,
      placar_b: scoreB?.value ?? null,
      wo: wo?.checked || false,
      observacoes: obs?.value || '',
      winner_side: winnerSide?.value || null,
      arbitro_nome: normalizeSumulaName(arbitro?.value || ''),
      mesario_nome: normalizeSumulaName(mesario?.value || ''),
      cartoes: sumulaCards,
      jogadores: buildSumulaPlayersPayload(),
    };

    const invalid = !payload.wo && (payload.placar_a === '' || payload.placar_b === '' || payload.placar_a === null || payload.placar_b === null);
    scoreA?.classList.toggle('input-erro', invalid);
    scoreB?.classList.toggle('input-erro', invalid);
    if (invalid) {
      setSumulaMsg('Placar invalido. Informe ambos os valores.', 'error');
      return;
    }

    const isKnockout = String(modal.dataset.fase || '').toUpperCase() !== 'GRUPOS';
    const tied = Number(payload.placar_a) === Number(payload.placar_b);
    if (!payload.wo && isKnockout && tied && !payload.winner_side) {
      setSumulaMsg('Empate em mata-mata exige vencedor no desempate.', 'error');
      toggleWinnerSideField();
      return;
    }

    const saveBtn = document.getElementById('sumulaSaveBtn');
    const saveNextBtn = document.getElementById('sumulaSaveNextBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Salvando...';
    }
    if (saveNextBtn) {
      saveNextBtn.disabled = true;
      saveNextBtn.textContent = 'Salvando...';
    }
    clearSumulaMsg();
    try {
      const res = await fetch(`/sumulas/jogos/${matchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        handleUnauthorized('Sessao expirada. Faca login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || 'Erro ao salvar');

      const idxAll = sorteioAllRows.findIndex((r) => String(r.id) === String(matchId));
      if (idxAll >= 0) {
        sorteioAllRows[idxAll] = mapSorteioRow({ ...sorteioAllRows[idxAll], ...data.match });
      }
      const idx = sorteioRows.findIndex((r) => String(r.id) === String(matchId));
      if (idx >= 0) {
        sorteioRows[idx] = mapSorteioRow({ ...sorteioRows[idx], ...data.match });
      }
      renderSorteioTabela();

      if (Array.isArray(data.standings) && data.standings.length) {
        const highlight = new Set([
          String(lastSumulaMatch?.equipeA || lastSumulaMatch?.equipe_a || '').trim(),
          String(lastSumulaMatch?.equipeB || lastSumulaMatch?.equipe_b || '').trim(),
        ]);
        const html = renderStandingsRows(data.standings, highlight);
        const bodyMain = document.getElementById('sumulaStandingsBody');
        const bodyModal = document.getElementById('sumulaLiveStandingsBody');
        if (bodyMain) bodyMain.innerHTML = html;
        if (bodyModal) bodyModal.innerHTML = html;
      } else {
        refreshSumulaStandings();
      }

      if (window.SuccessFeedback) {
        SuccessFeedback.show({ title: 'Sumula salva', message: 'Placar atualizado com sucesso.' });
      } else {
        safeShowToast({ type: 'success', title: 'Sumula salva', message: 'Placar atualizado.' });
      }

      if (goNext) {
        const next = findNextSumulaMatch();
        if (next && String(next.id) !== String(matchId)) {
          openSumulaModal(next);
        } else {
          closeSumulaModal();
        }
      } else {
        closeSumulaModal();
      }
    } catch (err) {
      setSumulaMsg(err.message || 'Falha ao salvar sumula.', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar';
      }
      if (saveNextBtn) {
        saveNextBtn.disabled = false;
        saveNextBtn.textContent = 'Salvar e proximo';
      }
    }
  }

  function openSumulaFromSelection() {
    if (lastSumulaMatch) {
      openSumulaModal(lastSumulaMatch);
      return;
    }
    if (!sorteioRows.length) {
      safeShowToast({ type: 'warning', title: 'Atencao', message: 'Selecione um jogo na tabela de sorteio.' });
      if (typeof window.openAdminTab === 'function') {
        window.openAdminTab('tabSorteio');
      }
      return;
    }
    const pending = sorteioRows.find((r) => normalizeSorteioStatus(r.status) !== 'DONE');
    openSumulaModal(pending || sorteioRows[0]);
  }

  function openSumulaMatchById(matchId) {
    const found = sorteioRows.find((row) => String(row.id) === String(matchId));
    if (!found) return;
    openSumulaModal(found);
  }

  function selectSorteioChave(chave) {
    const select = document.getElementById('sorteioChave');
    if (!select) return;
    select.value = chave;
    applySorteioFilter();
  }

  async function fetchSorteioEventos() {
    if (adminSessionExpired) return;
    const select = document.getElementById('sorteioEvento');
    if (!select) return;
    try {
      const res = await fetch('/eventos', { credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.sucesso) throw new Error('Erro ao carregar eventos.');
      sorteioEventos = data.data || [];
      const items = sorteioEventos.map(e => ({
        value: e.id,
        label: `${e.nome || 'Evento'}${e.ano ? ` (${e.ano})` : ''}`,
      }));
      setSelectOptionsByList(select, items, 'Evento');
      if (!select.value && sorteioEventos.length) {
        const preferred = sorteioEventos.find(e => e.status === 'ABERTO' || e.status === 'EM_ANDAMENTO') || sorteioEventos[0];
        if (preferred) select.value = preferred.id;
      }
    } catch (_) {
      select.innerHTML = '<option value="">Evento</option>';
    }
  }

  async function fetchSorteioModalidades() {
    const select = document.getElementById('sorteioModalidade');
    if (!select) return;
    const current = select.value;
    let list = Array.isArray(adminCache?.modalidades) ? adminCache.modalidades : [];
    if (!list.length) {
      try {
        let res = await fetch('/api/modalidades', { credentials: 'include' });
        if (res.status === 404) {
          res = await fetch('/modalidades', { credentials: 'include' });
        }
        const data = await res.json();
        list = Array.isArray(data) ? data : (data?.data || []);
      } catch (_) {
        list = [];
      }
    }
    sorteioModalidades = list || [];
    const items = sorteioModalidades.map(m => ({
      value: m.id,
      label: m.nome || m.titulo || `Modalidade ${m.id}`,
    }));
    setSelectOptionsByList(select, items, 'Todas as modalidades');
    if (current && items.some(i => String(i.value) === String(current))) {
      select.value = current;
    }
  }
  function applySorteioFilter() {
    const chave = document.getElementById('sorteioChave')?.value || '';
    if (!chave) {
      sorteioRows = [...sorteioAllRows];
    } else {
      sorteioRows = sorteioAllRows.filter(j => String(j.chave || '') === String(chave));
    }
    renderSorteioChavesTabela();
    renderSorteioTabela();
    updateSumulaChaveLabel();
    if (chave) refreshSumulaStandings();
  }

  async function carregarTabelaSorteioAdmin() {
    if (adminSessionExpired) return;
    const eventoId = document.getElementById('sorteioEvento')?.value;
    const modalidadeId = document.getElementById('sorteioModalidade')?.value;
    const sexo = document.getElementById('sorteioSexo')?.value;
    if (!eventoId || !modalidadeId || !sexo) {
      sorteioAllRows = [];
      sorteioRows = [];
      syncSorteioChaveOptions();
      renderSorteioChavesTabela();
      renderSorteioTabela();
      return;
    }
    renderSkeletonTable('sorteioChavesBody', 4, 5);
    renderSkeletonTable('sorteioBody', 6, 9);
    try {
      const res = await fetch(`/sorteio/${eventoId}/${modalidadeId}/${sexo}`, { credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized('Sessao expirada. Faca login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao carregar sorteio.');
      const jogos = data.data?.jogos || [];
      sorteioAllRows = jogos.map(mapSorteioRow);
      syncSorteioChaveOptions();
      adminCache.jogos = sorteioAllRows;
      updateSorteioTitle();
      const modSelect = document.getElementById('sorteioModalidade');
      if (modSelect && modSelect.options.length <= 1 && typeof window.preencherSelectsAdmin === 'function') {
        window.preencherSelectsAdmin();
      }
      applySorteioFilter();
    } catch (err) {
      sorteioAllRows = [];
      sorteioRows = [];
      syncSorteioChaveOptions();
      renderSorteioChavesTabela();
      renderSorteioTabela();
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao carregar tabela.' });
    }
  }

  async function gerarTabelaSorteioAdmin() {
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    const eventoId = document.getElementById('sorteioEvento')?.value;
    const modalidadeId = document.getElementById('sorteioModalidade')?.value;
    const sexo = document.getElementById('sorteioSexo')?.value;
    const local = document.getElementById('sorteioLocal')?.value || 'Quadra A';
    const modo = document.getElementById('sorteioModo')?.value || 'GRUPOS';
    const horaInicio = document.getElementById('sorteioHoraInicio')?.value || '07:30';
    const intervaloMin = Number(document.getElementById('sorteioIntervalo')?.value || 0);
    const multiMode = !modalidadeId;
    if (!eventoId || !sexo) {
      safeShowToast({ type: 'warning', title: 'Atencao', message: 'Selecione evento e sexo.' });
      return;
    }
    try {
      const payload = {
        evento_id: eventoId,
        sexo,
        local_jogos: local,
        modo,
        hora_inicio: horaInicio,
        intervalo_min: intervaloMin,
      };
      if (modalidadeId) payload.modalidade_id = modalidadeId;
      const res = await fetch('/sorteio/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        handleUnauthorized('Sessao expirada. Faca login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao gerar sorteio.');
      if (!multiMode) {
        const jogos = data.data?.jogos || [];
        sorteioAllRows = jogos.map(mapSorteioRow);
        syncSorteioChaveOptions();
        adminCache.jogos = sorteioAllRows;
        updateSorteioTitle();
        const modSelect = document.getElementById('sorteioModalidade');
        if (modSelect && modSelect.options.length <= 1 && typeof window.preencherSelectsAdmin === 'function') {
          window.preencherSelectsAdmin();
        }
        applySorteioFilter();
      } else {
        sorteioAllRows = [];
        sorteioRows = [];
        syncSorteioChaveOptions();
        renderSorteioChavesTabela();
        renderSorteioTabela();
      }
      const total = data?.data?.total_modalidades;
      safeShowToast({
        type: 'success',
        title: 'Sucesso',
        message: multiMode
          ? (total ? `Sorteio gerado para ${total} modalidades.` : 'Sorteio gerado para todas as modalidades.')
          : 'Tabela gerada.'
      });
    } catch (err) {
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao gerar sorteio.' });
    }
  }

  async function aplicarHorariosSorteioAdmin() {
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    const eventoId = document.getElementById('sorteioEvento')?.value;
    const modalidadeId = document.getElementById('sorteioModalidade')?.value;
    const sexo = document.getElementById('sorteioSexo')?.value;
    const horaInicio = document.getElementById('sorteioHoraInicio')?.value || '07:30';
    const intervaloMin = Number(document.getElementById('sorteioIntervalo')?.value || 0);
    if (!eventoId || !modalidadeId || !sexo) {
      safeShowToast({ type: 'warning', title: 'Atencao', message: 'Selecione evento, modalidade e sexo.' });
      return;
    }
    try {
      const res = await fetch('/sorteio/horarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          evento_id: eventoId,
          modalidade_id: modalidadeId,
          sexo,
          hora_inicio: horaInicio,
          intervalo_min: intervaloMin,
        }),
      });
      if (res.status === 401) {
        handleUnauthorized('Sessao expirada. Faca login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao aplicar horarios.');
      safeShowToast({ type: 'success', title: 'Sucesso', message: 'Horarios atualizados.' });
      carregarTabelaSorteioAdmin();
    } catch (err) {
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao aplicar horarios.' });
    }
  }

  async function limparSorteioAdmin() {
    if (adminSessionExpired) {
      showSessionBanner();
      return;
    }
    const eventoId = document.getElementById('sorteioEvento')?.value;
    const modalidadeId = document.getElementById('sorteioModalidade')?.value;
    const sexo = document.getElementById('sorteioSexo')?.value;
    if (!eventoId || !modalidadeId || !sexo) {
      safeShowToast({ type: 'warning', title: 'Atencao', message: 'Selecione evento, modalidade e sexo.' });
      return;
    }
    try {
      const res = await fetch('/sorteio/limpar', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ evento_id: eventoId, modalidade_id: modalidadeId, sexo }),
      });
      if (res.status === 401) {
        handleUnauthorized('Sessao expirada. Faca login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao limpar sorteio.');
      sorteioAllRows = [];
      sorteioRows = [];
      adminCache.jogos = [];
      syncSorteioChaveOptions();
      renderSorteioChavesTabela();
      renderSorteioTabela();
      safeShowToast({ type: 'success', title: 'Sucesso', message: 'Sorteio limpo.' });
    } catch (err) {
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao limpar sorteio.' });
    }
  }

  function bindSorteioTab() {
    if (sorteioReady) return;
    sorteioReady = true;
    Promise.all([fetchSorteioEventos(), fetchSorteioModalidades()]).then(() => {
      updateSorteioTitle();
    });
    document.getElementById('sorteioEvento')?.addEventListener('change', () => {
      updateSorteioTitle();
      sorteioAllRows = [];
      sorteioRows = [];
      syncSorteioChaveOptions();
      renderSorteioChavesTabela();
      renderSorteioTabela();
    });
    document.getElementById('sorteioModalidade')?.addEventListener('change', () => {
      updateSorteioTitle();
      refreshSumulaStandings();
    });
    document.getElementById('sorteioSexo')?.addEventListener('change', () => {
      refreshSumulaStandings();
    });
    document.getElementById('sorteioChave')?.addEventListener('change', applySorteioFilter);
    updateSumulaChaveLabel();
    document.getElementById('sumulaWo')?.addEventListener('change', toggleSumulaWo);
    document.getElementById('sumulaScoreA')?.addEventListener('input', toggleWinnerSideField);
    document.getElementById('sumulaScoreB')?.addEventListener('input', toggleWinnerSideField);
    document.getElementById('sumulaObs')?.addEventListener('input', updateObsCounter);
    document.getElementById('sumulaCardTeam')?.addEventListener('change', populateCardPlayerSelect);
    document.getElementById('sumulaCardPlayer')?.addEventListener('change', applyShirtFromSelectedPlayer);
    document.getElementById('sumulaCardShirt')?.addEventListener('input', normalizeSumulaCardShirtInput);
  }
  // =====================
  // Ranking
  // =====================
  function renderRankSkeleton() {
    const container = document.getElementById('rankTable');
    if (!container) return;
    container.innerHTML = `
      <div class="skeleton-card">
        ${Array.from({ length: 6 }).map(() => `<div class="skeleton-line"></div>`).join('')}
      </div>
    `;
  }

  function renderRankTabs(chaves, active, onClick) {
    const tabs = document.getElementById('rankTabs');
    if (!tabs) return;
    tabs.innerHTML = chaves.map(c => `
      <button class="admin-tab ${c === active ? 'active' : ''}" data-chave="${c}">${c}</button>
    `).join('');
    tabs.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => onClick(btn.dataset.chave));
    });
  }

  function renderRankTable(chave, data) {
    const container = document.getElementById('rankTable');
    const rows = data[chave] || [];
    if (!rows.length) {
      container.innerHTML = `<div class="muted">Nenhum dado para ${chave}.</div>`;
      return;
    }
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Equipe</th>
              <th>Pontos</th>
              <th>Vitorias</th>
              <th>Empates</th>
              <th>Derrotas</th>
              <th>Saldo</th>
              <th>Jogos</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.equipe}</td>
                <td>${r.pontos}</td>
                <td>${r.vitorias}</td>
                <td>${r.empates}</td>
                <td>${r.derrotas}</td>
                <td>${r.saldo}</td>
                <td>${r.jogos}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function rankFetchEventos() {
    try {
      const res = await fetch('/eventos', { credentials: 'include' });
      const data = await res.json();
      if (!data.sucesso) throw new Error();
      const select = document.getElementById('rankEventoSelect');
      if (!select) return;
      select.innerHTML = '<option value="">Evento</option>';
      (data.data || []).forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = `${e.nome} (${e.ano})`;
        select.appendChild(opt);
      });
    } catch {
      safeShowToast({ type: 'warning', title: 'Aviso', message: 'Nao foi possivel carregar eventos.' });
    }
  }

  async function rankFetchModalidades() {
    try {
      const res = await fetch('/api/modalidades');
      const data = await res.json();
      const select = document.getElementById('rankModalidadeSelect');
      if (!select) return;
      select.innerHTML = '<option value="">Modalidade</option>';
      (data || []).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.titulo || m.nome;
        select.appendChild(opt);
      });
    } catch {
      safeShowToast({ type: 'warning', title: 'Aviso', message: 'Nao foi possivel carregar modalidades.' });
    }
  }

  async function fetchRanking() {
    if (adminSessionExpired) return;
    const eventoId = document.getElementById('rankEventoSelect')?.value;
    const modalidadeId = document.getElementById('rankModalidadeSelect')?.value;
    const sexo = document.getElementById('rankSexoSelect')?.value;
    if (!eventoId || !modalidadeId || !sexo) {
      safeShowToast({ type: 'warning', title: 'Atencao', message: 'Selecione evento, modalidade e sexo.' });
      return;
    }
    renderRankSkeleton();
    try {
      const res = await fetch(`/ranking/${eventoId}/${modalidadeId}/${sexo}`, { credentials: 'include' });
      const data = await res.json();
      if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro');
      const ranking = data.data || {};
      const chaves = Object.keys(ranking);
      if (!chaves.length) {
        document.getElementById('rankTable').innerHTML = '<div class="muted">Sem ranking disponivel.</div>';
        document.getElementById('rankTabs').innerHTML = '';
        return;
      }
      let active = chaves[0];
      renderRankTabs(chaves, active, (c) => {
        active = c;
        renderRankTabs(chaves, active, renderRankTable.bind(null, active, ranking));
        renderRankTable(active, ranking);
      });
      renderRankTable(active, ranking);
    } catch (err) {
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao carregar ranking.' });
    }
  }

  function bindRankingTab() {
    if (rankingReady) return;
    rankingReady = true;
    document.getElementById('rankBtnAtualizar')?.addEventListener('click', fetchRanking);
    rankFetchEventos();
    rankFetchModalidades();
  }

  // =====================
  // Logs
  // =====================
  let logsPage = 1;
  const logsLimit = 20;
  let logsTotal = 0;

  function renderLogsSkeleton() {
    const tbody = document.getElementById('logsTable');
    if (!tbody) return;
    tbody.innerHTML = Array.from({ length: 6 }).map(() => `
      <tr>
        ${Array.from({ length: 6 }).map(() => `<td><div class="skeleton-line"></div></td>`).join('')}
      </tr>
    `).join('');
  }

  function renderLogs(items) {
    const tbody = document.getElementById('logsTable');
    if (!tbody) return;
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="center muted" style="padding:18px;">Nenhum log encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = items.map(l => `
      <tr>
        <td>${new Date(l.criado_em).toLocaleString('pt-BR')}</td>
        <td>${l.admin_nome || '-'}</td>
        <td>${l.acao}</td>
        <td>${l.entidade}</td>
        <td>${l.entidade_id || '-'}</td>
        <td>${l.ip || '-'}</td>
      </tr>
    `).join('');
  }

  async function fetchAdminsForLogs() {
    try {
      const res = await fetch('/admins', { credentials: 'include' });
      const data = await res.json();
      if (!data.sucesso) throw new Error();
      const select = document.getElementById('logsAdminFilter');
      if (!select) return;
      select.innerHTML = '<option value="">Todos</option>';
      (data.data || []).forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.nome;
        select.appendChild(opt);
      });
    } catch {
      safeShowToast({ type: 'warning', title: 'Aviso', message: 'Nao foi possivel carregar admins.' });
    }
  }

  async function fetchLogs() {
    if (adminSessionExpired) return;
    renderLogsSkeleton();
    const params = new URLSearchParams();
    const from = document.getElementById('logsFromDate')?.value;
    const to = document.getElementById('logsToDate')?.value;
    const admin_id = document.getElementById('logsAdminFilter')?.value;
    const entidade = document.getElementById('logsEntityFilter')?.value?.trim();
    const q = document.getElementById('logsQueryFilter')?.value?.trim();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (admin_id) params.append('admin_id', admin_id);
    if (entidade) params.append('q', entidade);
    if (q) params.append('q', q);
    params.append('limit', logsLimit);
    params.append('offset', (logsPage - 1) * logsLimit);

    try {
      const res = await fetch(`/logs?${params.toString()}`, { credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data.sucesso) throw new Error(data?.erro?.mensagem || 'Erro');
      logsTotal = data.data.total;
      renderLogs(data.data.items || []);
      const pageInfo = document.getElementById('logsPageInfo');
      if (pageInfo) pageInfo.textContent = `Pagina ${logsPage}`;
    } catch (err) {
      safeShowToast({ type: 'error', title: 'Erro', message: err.message || 'Falha ao carregar logs.' });
    }
  }

  function bindLogsTab() {
    if (logsReady) return;
    logsReady = true;
    document.getElementById('logsApplyFilter')?.addEventListener('click', () => {
      logsPage = 1;
      fetchLogs();
    });
    document.getElementById('logsPrev')?.addEventListener('click', () => {
      if (logsPage > 1) {
        logsPage -= 1;
        fetchLogs();
      }
    });
    document.getElementById('logsNext')?.addEventListener('click', () => {
      if (logsPage * logsLimit < logsTotal) {
        logsPage += 1;
        fetchLogs();
      }
    });
    fetchAdminsForLogs();
    fetchLogs();
  }

  // =====================
  // Exports and tab hook
  // =====================
  window.loadEventosAdmin = loadEventosAdmin;
  window.orgOpenEdit = orgOpenEdit;
  window.orgToggleAtivo = orgToggleAtivo;
  window.orgDeleteOrganizador = orgDeleteOrganizador;
  window.orgCloseModal = orgCloseModal;
  window.orgResetTempPassword = orgResetTempPassword;
  window.createOrganizadorAdmin = createOrganizadorAdmin;
  window.saveEditOrganizadorAdmin = saveEditOrganizadorAdmin;

  window.admCloseModal = admCloseModal;
  window.admOpenEdit = admOpenEdit;
  window.admToggleAtivo = admToggleAtivo;
  window.admDelete = admDelete;
  window.admResetTempPassword = admResetTempPassword;
  window.createAdminUser = createAdminUser;
  window.saveEditAdminUser = saveEditAdminUser;
  window.gerarTabelaSorteio = gerarTabelaSorteioAdmin;
  window.aplicarHorariosSorteio = aplicarHorariosSorteioAdmin;
  window.limparSorteio = limparSorteioAdmin;
  window.carregarTabelaSorteio = carregarTabelaSorteioAdmin;
  window.selectSorteioChave = selectSorteioChave;
  window.openSumulaFromSelection = openSumulaFromSelection;
  window.openSumulaMatchById = openSumulaMatchById;
  window.closeSumulaModal = closeSumulaModal;
  window.saveSumulaModal = saveSumulaModal;
  window.refreshSumulaStandings = refreshSumulaStandings;
  window.addSumulaCard = addSumulaCard;
  window.removeSumulaCard = removeSumulaCard;
  window.updateSumulaPlayerShirt = updateSumulaPlayerShirt;

    const basePreencherSelectsAdmin = window.preencherSelectsAdmin;
  window.preencherSelectsAdmin = function () {
    if (typeof basePreencherSelectsAdmin === 'function') {
      basePreencherSelectsAdmin();
    }
    if (sorteioModalidades.length) {
      const select = document.getElementById('sorteioModalidade');
      if (select && select.options.length <= 1) {
        setSelectOptionsByList(
          select,
          sorteioModalidades.map(m => ({ value: m.id, label: m.nome || m.titulo || `Modalidade ${m.id}` })),
          'Todas as modalidades'
        );
      }
    }
  };

  window.preencherSelectSorteio = function () {
    fetchSorteioModalidades();
    fetchSorteioEventos();
  };

  window.preencherSumulaFromSorteio = function (idx = 0) {
    if (!sorteioRows.length) {
      safeShowToast({ type: 'warning', title: 'Atencao', message: 'Gere a tabela de sorteio primeiro.' });
      return;
    }
    const jogo = sorteioRows[idx] || sorteioRows[0];
    if (!jogo) return;
    openSumulaModal(jogo);
  };

  window.handleAdminTabSwitch = (tabId) => {
    if (tabId === 'tabEventos') bindEventosTab();
    if (tabId === 'tabOrganizadores') bindOrganizadoresTab();
    if (tabId === 'tabAdmins') bindAdminsTab();
    if (tabId === 'tabSorteio') bindSorteioTab();
    if (tabId === 'tabRanking') bindRankingTab();
    if (tabId === 'tabLogs') bindLogsTab();
    if (tabId === 'tabSumula') {
      if (typeof window.populateModalidadeSelects === 'function') {
        window.populateModalidadeSelects();
      }
      if (typeof window.preencherSelectsAdmin === 'function') {
        window.preencherSelectsAdmin();
      }
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    ensureAdminSession();
    document.getElementById('sumulaWo')?.addEventListener('change', toggleSumulaWo);
    document.getElementById('sumulaScoreA')?.addEventListener('input', toggleWinnerSideField);
    document.getElementById('sumulaScoreB')?.addEventListener('input', toggleWinnerSideField);
    document.getElementById('sumulaObs')?.addEventListener('input', updateObsCounter);
    document.getElementById('sumulaCardTeam')?.addEventListener('change', populateCardPlayerSelect);
    document.getElementById('sumulaCardPlayer')?.addEventListener('change', applyShirtFromSelectedPlayer);
    document.getElementById('sumulaCardShirt')?.addEventListener('input', normalizeSumulaCardShirtInput);
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && typeof window.switchAdminTab === 'function') {
      window.switchAdminTab(tab);
    }
    const active = document.querySelector('.admin-tab.active');
    if (active && typeof window.handleAdminTabSwitch === 'function') {
      window.handleAdminTabSwitch(active.dataset.tab);
    }
  });
})();




