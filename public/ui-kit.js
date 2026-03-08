(() => {
  const THEME_KEY = 'jics-theme';
  const TOAST_DURATION = 4000;
  const LOADER_MIN_DURATION = 1200;
  let confirmCallback = null;
  let loaderVisibleAt = 0;
  let loaderCount = 0;
  let loaderHideTimer = null;

  function applyTheme(theme) {
    const value = theme === 'dark' ? 'dark' : 'light';
    document.body.dataset.theme = value;
  }

  function setThemeFromStorage() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) {
      applyTheme(stored);
      return;
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  function toggleTheme() {
    const isDark = document.body.dataset.theme === 'dark';
    const next = isDark ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  function createToastStack() {
    if (document.getElementById('toast-stack')) return;
    const stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }

  function showToast({ type = 'info', title, message }) {
    if ((type === 'success' || type === 'info') && window.SuccessFeedback && typeof window.SuccessFeedback.show === 'function') {
      window.SuccessFeedback.show({ title: title || 'Concluído!', message: message || '' });
      return;
    }
    createToastStack();
    const stack = document.getElementById('toast-stack');
    const toast = document.createElement('div');
    toast.className = `kit-toast ${type}`;
    toast.innerHTML = `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
        <div>
          <div class="kit-toast-title">${title || 'Mensagem'}</div>
          <div class="kit-toast-message">${message || ''}</div>
        </div>
        <button class="kit-toast-close" aria-label="Fechar">x</button>
      </div>
    `;
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    const close = () => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    };
    toast.querySelector('button').addEventListener('click', close);
    setTimeout(close, TOAST_DURATION);
  }

  function createLoader() {
    if (document.getElementById('global-loader')) return;
    const loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.className = 'modal hidden';
    loader.innerHTML = `
      <div class="modal-card">
        <div class="loader-card">
          <span class="spinner" aria-hidden="true"></span>
          <div class="loader-texts">
            <strong>Carregando</strong>
            <small id="global-loader-text">Aguarde um instante...</small>
          </div>
          <div class="loader-track" aria-hidden="true"><span></span></div>
        </div>
      </div>
    `;
    document.body.appendChild(loader);
  }

  function hideLoaderWithDelay() {
    const loader = document.getElementById('global-loader');
    if (!loader) return;
    const elapsed = Date.now() - loaderVisibleAt;
    const remaining = Math.max(0, LOADER_MIN_DURATION - elapsed);
    clearTimeout(loaderHideTimer);
    loaderHideTimer = setTimeout(() => {
      loader.classList.add('hidden');
      loaderHideTimer = null;
    }, remaining);
  }

  function showLoading(show, message) {
    createLoader();
    const loader = document.getElementById('global-loader');
    if (!loader) return;

    const loaderText = document.getElementById('global-loader-text');
    if (loaderText) loaderText.textContent = message || 'Aguarde um instante...';

    if (show) {
      loaderCount += 1;
      clearTimeout(loaderHideTimer);
      loaderHideTimer = null;
      if (loader.classList.contains('hidden')) {
        loader.classList.remove('hidden');
        loaderVisibleAt = Date.now();
      }
      return;
    }

    loaderCount = Math.max(0, loaderCount - 1);
    if (loaderCount === 0) {
      hideLoaderWithDelay();
    }
  }

  function createConfirmModal() {
    if (document.getElementById('confirm-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3 id="confirm-title">Confirmar ação</h3>
          <button class="icon-btn" id="confirm-close" aria-label="Fechar">x</button>
        </div>
        <div class="modal-body">
          <p id="confirm-message">Tem certeza que deseja continuar?</p>
        </div>
        <div class="modal-footer">
          <button class="btn-outline" id="confirm-cancel">Cancelar</button>
          <button class="btn-danger" id="confirm-submit">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => closeConfirmModal();
    modal.querySelector('#confirm-close').addEventListener('click', close);
    modal.querySelector('#confirm-cancel').addEventListener('click', close);
  }

  function openConfirmModal({ title, message, onConfirm }) {
    createConfirmModal();
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const confirmBtn = document.getElementById('confirm-submit');

    titleEl.textContent = title || 'Confirmar ação';
    messageEl.textContent = message || 'Tem certeza que deseja continuar?';
    confirmBtn.disabled = false;
    confirmCallback = onConfirm || null;

    confirmBtn.onclick = () => {
      if (typeof confirmCallback === 'function') confirmCallback();
      closeConfirmModal();
    };

    modal.classList.remove('hidden');
  }

  function closeConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    confirmCallback = null;
  }

  function init() {
    createToastStack();
    createLoader();
    createConfirmModal();
    setThemeFromStorage();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.JICS_UI = {
    showToast,
    openConfirmModal,
    showLoading,
    setThemeFromStorage,
    toggleTheme,
  };

  window.showToast = showToast;
  window.openConfirmModal = openConfirmModal;
  window.showLoading = showLoading;
  window.setThemeFromStorage = setThemeFromStorage;
  window.toggleTheme = toggleTheme;
})();

