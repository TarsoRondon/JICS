
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

  function mapSorteioRow(j) {
    return {
      ...j,
      equipeA: j.equipeA || j.equipe_a || j.equipeA_nome || '-',
      equipeB: j.equipeB || j.equipe_b || j.equipeB_nome || '-',
      hora: j.hora || j.hora_oficial || j.hora_texto || '',
      jogo: j.jogo || j.numero_jogo || j.jogo_label || `Jogo ${j.ordem || j.id || ''}`.trim(),
      chave: j.chave || j.chave_grupo || 'CH A',
      status: j.status || 'NAO_INICIADO',
    };
  }

  function updateSorteioTitle() {
    const title = document.getElementById('sorteioTituloModalidade');
    const eventoId = document.getElementById('sorteioEvento')?.value;
    const modalidadeId = document.getElementById('sorteioModalidade')?.value;
    if (!title) return;
    const evento = sorteioEventos.find(e => String(e.id) === String(eventoId));
    const modalidade = sorteioModalidades.find(m => String(m.id) === String(modalidadeId));
    if (evento && modalidade) {
      title.textContent = `Tabela de sorteio • ${modalidade.nome || modalidade.titulo} • ${evento.nome || 'Evento'} ${evento.ano ? `(${evento.ano})` : ''}`;
    } else {
      title.textContent = 'Tabela de sorteio';
    }
  }

  function applySorteioFilter() {
    const chave = document.getElementById('sorteioChave')?.value || '';
    if (!chave) {
      sorteioRows = [...sorteioAllRows];
    } else {
      sorteioRows = sorteioAllRows.filter(j => String(j.chave || '') === String(chave));
    }
    renderSorteioTabela();
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
    if (adminSessionExpired) return;
    const select = document.getElementById('sorteioModalidade');
    if (!select) return;
    let list = Array.isArray(adminCache?.modalidades) ? adminCache.modalidades : [];
    if (!list.length) {
      try {
        const res = await fetch('/modalidades', { credentials: 'include' });
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
    setSelectOptionsByList(select, items, 'Modalidade');
  }

  async function carregarTabelaSorteioAdmin() {
    if (adminSessionExpired) return;
    const eventoId = document.getElementById('sorteioEvento')?.value;
    const modalidadeId = document.getElementById('sorteioModalidade')?.value;
    const sexo = document.getElementById('sorteioSexo')?.value;
    if (!eventoId || !modalidadeId || !sexo) {
      sorteioAllRows = [];
      sorteioRows = [];
      renderSorteioTabela();
      return;
    }
    renderSkeletonTable('sorteioBody', 6, 9);
    try {
      const res = await fetch(`/sorteio/${eventoId}/${modalidadeId}/${sexo}`, { credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao carregar sorteio.');
      const jogos = data.data?.jogos || [];
      sorteioAllRows = jogos.map(mapSorteioRow);
      adminCache.jogos = sorteioAllRows;
      updateSorteioTitle();
      if (typeof window.preencherSelectsAdmin === 'function') {
        window.preencherSelectsAdmin();
      }
      applySorteioFilter();
    } catch (err) {
      sorteioAllRows = [];
      sorteioRows = [];
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
    if (!eventoId || !modalidadeId || !sexo) {
      safeShowToast({ type: 'warning', title: 'Atencao', message: 'Selecione evento, modalidade e sexo.' });
      return;
    }
    try {
      const res = await fetch('/sorteio/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          evento_id: eventoId,
          modalidade_id: modalidadeId,
          sexo,
          local_jogos: local,
          modo,
          hora_inicio: horaInicio,
          intervalo_min: intervaloMin,
        }),
      });
      if (res.status === 401) {
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao gerar sorteio.');
      const jogos = data.data?.jogos || [];
      sorteioAllRows = jogos.map(mapSorteioRow);
      adminCache.jogos = sorteioAllRows;
      updateSorteioTitle();
      if (typeof window.preencherSelectsAdmin === 'function') {
        window.preencherSelectsAdmin();
      }
      applySorteioFilter();
      safeShowToast({ type: 'success', title: 'Sucesso', message: 'Tabela gerada.' });
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
        handleUnauthorized('Sessão expirada. Faça login novamente.');
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
        handleUnauthorized('Sessão expirada. Faça login novamente.');
        return;
      }
      const data = await res.json();
      if (!data?.sucesso) throw new Error(data?.erro?.mensagem || 'Erro ao limpar sorteio.');
      sorteioAllRows = [];
      sorteioRows = [];
      adminCache.jogos = [];
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
      if (document.getElementById('sorteioEvento')?.value && document.getElementById('sorteioModalidade')?.value) {
        carregarTabelaSorteioAdmin();
      }
    });
    document.getElementById('sorteioEvento')?.addEventListener('change', () => {
      updateSorteioTitle();
      carregarTabelaSorteioAdmin();
    });
    document.getElementById('sorteioModalidade')?.addEventListener('change', () => {
      updateSorteioTitle();
      carregarTabelaSorteioAdmin();
    });
    document.getElementById('sorteioSexo')?.addEventListener('change', () => {
      carregarTabelaSorteioAdmin();
    });
    document.getElementById('sorteioChave')?.addEventListener('change', applySorteioFilter);
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
      const res = await fetch('/modalidades');
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

  const basePreencherSelectsAdmin = window.preencherSelectsAdmin;
  window.preencherSelectsAdmin = function () {
    if (typeof basePreencherSelectsAdmin === 'function') {
      basePreencherSelectsAdmin();
    }
    if (sorteioModalidades.length) {
      setSelectOptionsByList(
        document.getElementById('sorteioModalidade'),
        sorteioModalidades.map(m => ({ value: m.id, label: m.nome || m.titulo || `Modalidade ${m.id}` })),
        'Modalidade'
      );
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
    const modalSel = document.getElementById('sorteioModalidade');
    const sexoSel = document.getElementById('sorteioSexo');
    const sumMod = document.getElementById('sumulaModalidade');
    const sumSexo = document.getElementById('sumulaSexo');
    if (sumMod && modalSel) {
      const label = modalSel.options[modalSel.selectedIndex]?.text || '';
      sumMod.value = label;
    }
    if (sumSexo && sexoSel) {
      const val = sexoSel.value === 'M' ? 'Masculino' : sexoSel.value === 'F' ? 'Feminino' : '';
      sumSexo.value = val;
    }
    const equipeA = document.getElementById('sumulaEquipeA');
    const equipeB = document.getElementById('sumulaEquipeB');
    if (equipeA) equipeA.value = jogo.equipeA || '';
    if (equipeB) equipeB.value = jogo.equipeB || '';
    const fase = document.getElementById('sumulaFase');
    if (fase) fase.value = jogo.jogo || jogo.numero_jogo || 'Classificatoria';
    const data = document.getElementById('sumulaData');
    if (data && !data.value) data.valueAsDate = new Date();
    document.getElementById('tabSumula')?.scrollIntoView({ behavior: 'smooth' });
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

