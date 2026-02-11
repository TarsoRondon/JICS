document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  const form = document.getElementById('adminForm');
  const btn = document.getElementById('btnSalvar');
  const nome = document.getElementById('nome');
  const email = document.getElementById('email');
  const senha = document.getElementById('senha');
  const role = document.getElementById('role');
  const orgId = document.getElementById('orgId');
  const formMsg = document.getElementById('adminFormMsg');

  function setFormMessage(text, type = 'error') {
    if (!formMsg) return;
    formMsg.textContent = text || '';
    formMsg.classList.remove('success', 'error', 'show');
    if (text) {
      formMsg.classList.add('show', type === 'success' ? 'success' : 'error');
    }
  }

  function setError(input, msg) {
    const field = input.closest('.field');
    field.classList.add('error');
    const hint = field.querySelector('.hint');
    if (hint) hint.textContent = msg || '';
  }

  function clearError(input) {
    const field = input.closest('.field');
    field.classList.remove('error');
    const hint = field.querySelector('.hint');
    if (hint) hint.textContent = '';
  }

  function bindClearOnInput(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      clearError(input);
      setFormMessage('');
    });
  }

  bindClearOnInput(nome);
  bindClearOnInput(email);
  bindClearOnInput(senha);
  bindClearOnInput(orgId);

  async function prefillOrganization() {
    if (!orgId) return;
    try {
      const res = await fetch('/auth/admin/me', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.sucesso) return;
      const org = data?.data?.organization;
      const adminOrg = data?.data?.admin?.organization_id;
      const value = org?.id || adminOrg;
      if (value) {
        orgId.value = value;
        orgId.readOnly = true;
      }
    } catch (_) {
      // silencioso para nao quebrar UX
    }
  }

  prefillOrganization();

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormMessage('');
    clearError(nome);
    clearError(email);
    clearError(senha);

    if (!nome.value.trim()) {
      setError(nome, 'Nome obrigatório.');
      setFormMessage('Preencha os campos obrigatórios.');
      return;
    }
    if (!email.value.trim()) {
      setError(email, 'E-mail obrigatório.');
      setFormMessage('Preencha os campos obrigatórios.');
      return;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    if (!emailOk) {
      setError(email, 'E-mail inválido.');
      setFormMessage('Informe um e-mail válido.');
      return;
    }
    if (!senha.value.trim()) {
      setError(senha, 'Senha obrigatória.');
      setFormMessage('Preencha os campos obrigatórios.');
      return;
    }

    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const payload = {
        nome: nome.value.trim(),
        email: email.value.trim(),
        senha: senha.value,
        role: role.value
      };
      const orgValue = String(orgId?.value || '').trim();
      if (orgValue) payload.organization_id = Number(orgValue);

      const res = await fetch('/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      if (!res.ok || data.sucesso === false) {
        const msg = data?.erro?.mensagem || data?.mensagem || 'Erro ao cadastrar admin.';
        throw new Error(msg);
      }
      if (window.SuccessFeedback?.show) {
        window.SuccessFeedback.show({
          title: 'Administrador criado',
          message: 'Cadastro realizado com sucesso.'
        });
      }
      setFormMessage('Administrador cadastrado com sucesso.', 'success');
      form.reset();
      if (orgId && orgId.readOnly) {
        prefillOrganization();
      }
    } catch (err) {
      setFormMessage(err.message || 'Não foi possível cadastrar.', 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
});
