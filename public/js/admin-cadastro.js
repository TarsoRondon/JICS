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

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(matricula);
    clearError(senha);

    if (!matricula.value.trim()) {
      setError(matricula, 'Matrícula obrigatória.');
      return;
    }
    if (!senha.value.trim()) {
      setError(senha, 'Senha obrigatória.');
      return;
    }

    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const res = await fetch('/admin/cadastrar-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricula: matricula.value.trim(),
          senha: senha.value,
          role: role.value,
          criado_por_matricula: criadoPor.value.trim() || undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.sucesso === false) {
        throw new Error(data.mensagem || 'Erro ao cadastrar admin.');
      }
      window.toast?.('Admin cadastrado com sucesso!', 'ok');
      form.reset();
    } catch (err) {
      window.toast?.(err.message, 'err');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
});
