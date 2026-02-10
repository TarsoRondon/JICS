document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  const form = document.getElementById('adminForm');
  const btn = document.getElementById('btnSalvar');
  const matricula = document.getElementById('matricula');
  const senha = document.getElementById('senha');
  const role = document.getElementById('role');
  const criadoPor = document.getElementById('criadoPor');
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

  bindClearOnInput(matricula);
  bindClearOnInput(senha);
  bindClearOnInput(criadoPor);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormMessage('');
    clearError(matricula);
    clearError(senha);

    if (!matricula.value.trim()) {
      setError(matricula, 'Matrícula obrigatória.');
      setFormMessage('Preencha os campos obrigatórios.');
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
      const res = await fetch('/admin/cadastrar-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          matricula: matricula.value.trim(),
          senha: senha.value,
          role: role.value,
          criado_por_matricula: criadoPor.value.trim() || undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      if (!res.ok || data.sucesso === false) {
        throw new Error(data.mensagem || 'Erro ao cadastrar admin.');
      }
      setFormMessage('Admin cadastrado com sucesso.', 'success');
      form.reset();
    } catch (err) {
      setFormMessage(err.message || 'Não foi possível cadastrar.', 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
});
