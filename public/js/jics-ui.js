/**
 * JICS UI & Microinteractions Engine
 * Plataforma Esportiva SaaS — IFRO Jogos Internos
 */

(function () {
  'use strict';

  const THEME_STORAGE_KEY = 'jics-theme';
  let toastContainer = null;
  let searchModal = null;
  let notifDrawer = null;

  // ══════════════════════════════════════════════════════════════
  // 1. GERENCIAMENTO DE TEMA (DARK / LIGHT / SISTEMA)
  // ══════════════════════════════════════════════════════════════
  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }

    // Ouvinte para mudança nas preferências do SO
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
          setTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  function setTheme(theme) {
    const activeTheme = theme === 'dark' ? 'dark' : 'light';
    document.body.dataset.theme = activeTheme;
    document.documentElement.dataset.theme = activeTheme;
    localStorage.setItem(THEME_STORAGE_KEY, activeTheme);

    // Atualiza ícones nos botões de alternância de tema
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      const icon = btn.querySelector('.material-symbols-outlined') || btn;
      if (icon) {
        icon.textContent = activeTheme === 'dark' ? 'light_mode' : 'dark_mode';
      }
      btn.setAttribute('title', activeTheme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro');
    });
  }

  function toggleTheme() {
    const isDark = document.body.dataset.theme === 'dark';
    setTheme(isDark ? 'light' : 'dark');
    toast({
      type: 'info',
      title: 'Tema atualizado',
      message: `Modo ${isDark ? 'claro' : 'escuro'} ativado.`,
      duration: 2000
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 2. SISTEMA GLOBAL DE TOAST
  // ══════════════════════════════════════════════════════════════
  function ensureToastContainer() {
    if (!toastContainer || !document.body.contains(toastContainer)) {
      toastContainer = document.getElementById('toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
      }
    }
    return toastContainer;
  }

  function toast(options) {
    const container = ensureToastContainer();
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    const type = opts.type || 'info';
    const title = opts.title || (type === 'success' ? 'Sucesso' : type === 'error' ? 'Erro' : type === 'warning' ? 'Atenção' : 'Notificação');
    const message = opts.message || '';
    const duration = opts.duration || 4000;

    const iconMap = {
      success: 'check_circle',
      error: 'error',
      warning: 'warning',
      info: 'info'
    };

    const toastEl = document.createElement('div');
    toastEl.className = `jics-toast toast-${type}`;
    toastEl.innerHTML = `
      <span class="material-symbols-outlined text-${type === 'success' ? 'success' : type === 'error' ? 'error' : 'primary'}" style="font-size:22px;flex-shrink:0;">${iconMap[type] || 'info'}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:var(--t-sm);color:var(--text-main);line-height:1.2;">${escapeHTML(title)}</div>
        ${message ? `<div style="font-size:var(--t-xs);color:var(--text-secondary);margin-top:2px;line-height:1.4;">${escapeHTML(message)}</div>` : ''}
      </div>
      <button type="button" class="toast-close-btn" style="color:var(--text-muted);font-size:16px;padding:2px;" aria-label="Fechar">&times;</button>
    `;

    container.appendChild(toastEl);
    requestAnimationFrame(() => {
      toastEl.classList.add('show');
    });

    const removeToast = () => {
      toastEl.classList.remove('show');
      setTimeout(() => toastEl.remove(), 250);
    };

    toastEl.querySelector('.toast-close-btn').addEventListener('click', removeToast);
    if (duration > 0) {
      setTimeout(removeToast, duration);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 3. DIÁLOGO DE CONFIRMAÇÃO SEGURO
  // ══════════════════════════════════════════════════════════════
  function confirm(options) {
    const {
      title = 'Confirmar ação',
      message = 'Tem certeza que deseja continuar?',
      confirmText = 'Confirmar',
      cancelText = 'Cancelar',
      isDanger = false,
      onConfirm = null,
      onCancel = null
    } = options || {};

    let modal = document.getElementById('jics-confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'jics-confirm-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-content" role="dialog" aria-modal="true">
        <div style="display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s4);">
          <div style="width:40px;height:40px;border-radius:var(--r-md);background:${isDanger ? 'rgba(239,68,68,0.15)' : 'var(--p-soft)'};color:${isDanger ? '#EF4444' : 'var(--p-secondary)'};display:grid;place-items:center;">
            <span class="material-symbols-outlined">${isDanger ? 'warning' : 'help_outline'}</span>
          </div>
          <div>
            <h3 style="font-size:var(--t-lg);font-weight:700;">${escapeHTML(title)}</h3>
          </div>
        </div>
        <p style="margin-bottom:var(--s6);font-size:var(--t-sm);color:var(--text-secondary);">${escapeHTML(message)}</p>
        <div style="display:flex;justify-content:flex-end;gap:var(--s3);">
          <button type="button" class="btn btn-secondary" id="confirm-btn-cancel">${escapeHTML(cancelText)}</button>
          <button type="button" class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="confirm-btn-ok">${escapeHTML(confirmText)}</button>
        </div>
      </div>
    `;

    modal.classList.add('open');

    const closeModal = () => {
      modal.classList.remove('open');
    };

    const okBtn = modal.querySelector('#confirm-btn-ok');
    const cancelBtn = modal.querySelector('#confirm-btn-cancel');

    cancelBtn.onclick = () => {
      closeModal();
      if (typeof onCancel === 'function') onCancel();
    };

    okBtn.onclick = async () => {
      if (typeof onConfirm === 'function') {
        setButtonLoading(okBtn, true);
        try {
          await onConfirm();
        } finally {
          setButtonLoading(okBtn, false);
          closeModal();
        }
      } else {
        closeModal();
      }
    };

    modal.onclick = (e) => {
      if (e.target === modal) {
        closeModal();
        if (typeof onCancel === 'function') onCancel();
      }
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 4. LOADING STATE NOS BOTÕES E OVERLAY
  // ══════════════════════════════════════════════════════════════
  function setButtonLoading(button, isLoading, loadingText = '') {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.innerHTML;
      button.classList.add('is-loading');
      button.disabled = true;
      if (loadingText) {
        button.setAttribute('aria-label', loadingText);
      }
    } else {
      button.classList.remove('is-loading');
      button.disabled = false;
      if (button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  function showLoading(show, message = 'Carregando dados...') {
    let loader = document.getElementById('jics-global-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'jics-global-loader';
      loader.className = 'modal-overlay';
      loader.innerHTML = `
        <div class="modal-content" style="max-width:320px;text-align:center;padding:var(--s6);">
          <div style="width:48px;height:48px;border:3px solid var(--p-soft);border-top-color:var(--p-secondary);border-radius:50%;margin:0 auto var(--s4);animation:jicsSpinner 0.8s linear infinite;"></div>
          <h4 style="font-size:var(--t-base);font-weight:700;" id="jics-loader-text">Carregando</h4>
          <p style="font-size:var(--t-xs);color:var(--text-secondary);margin-top:4px;">Aguarde um instante...</p>
        </div>
      `;
      document.body.appendChild(loader);
    }
    const textEl = loader.querySelector('#jics-loader-text');
    if (textEl && message) textEl.textContent = message;

    if (show) {
      loader.classList.add('open');
    } else {
      loader.classList.remove('open');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 5. ANIMAÇÃO DE NÚMEROS (COUNTUP) & CONTADOR REGRESSIVO
  // ══════════════════════════════════════════════════════════════
  function countUp(element, endVal, duration = 1200) {
    if (!element) return;
    const target = Number(endVal) || 0;
    const startVal = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Easing suave cubic-out
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(startVal + (target - startVal) * ease);
      element.textContent = current.toLocaleString('pt-BR');

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = target.toLocaleString('pt-BR');
      }
    }
    requestAnimationFrame(update);
  }

  function startCountdown(element, targetDate) {
    if (!element || !targetDate) return;
    const target = new Date(targetDate).getTime();

    function updateCountdown() {
      const now = new Date().getTime();
      const diff = target - now;

      if (diff <= 0) {
        element.textContent = 'EM ANDAMENTO';
        element.classList.add('live');
        return;
      }

      const hours = Math.floor((diff / (1000 * 60 * 60)));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      element.textContent = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return interval;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // ══════════════════════════════════════════════════════════════
  // 6. ANIMAÇÃO DE PLACAR AO PONTUAR (SCORE BUMP)
  // ══════════════════════════════════════════════════════════════
  function bumpScore(element, newScore) {
    if (!element) return;
    if (newScore !== undefined) {
      element.textContent = newScore;
    }
    element.classList.remove('score-bump');
    // Força reflow para reiniciar a animação
    void element.offsetWidth;
    element.classList.add('score-bump');
  }

  // ══════════════════════════════════════════════════════════════
  // 7. BUSCA GLOBAL (CTRL + K)
  // ══════════════════════════════════════════════════════════════
  function initGlobalSearch() {
    if (searchModal) return;

    searchModal = document.createElement('div');
    searchModal.id = 'jics-search-modal';
    searchModal.className = 'modal-overlay';
    searchModal.innerHTML = `
      <div class="modal-content" style="max-width:580px;padding:var(--s4);top:10%;position:relative;">
        <div style="display:flex;align-items:center;gap:var(--s3);padding:var(--s2) var(--s3);border-bottom:1px solid var(--border-subtle);">
          <span class="material-symbols-outlined text-primary">search</span>
          <input id="global-search-input" type="text" placeholder="Buscar atletas, equipes, jogos, modalidades..." style="width:100%;border:none;background:transparent;outline:none;font-size:var(--t-base);color:var(--text-main);" autocomplete="off"/>
          <kbd style="padding:2px 6px;border-radius:var(--r-xs);background:var(--bg-surface-2);border:1px solid var(--border-subtle);font-size:11px;color:var(--text-muted);">ESC</kbd>
        </div>
        <div id="global-search-results" style="max-height:360px;overflow-y:auto;padding:var(--s3) 0;">
          <div style="padding:var(--s4);text-align:center;color:var(--text-muted);font-size:var(--t-xs);">
            Digite para pesquisar em tempo real no JICS.
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(searchModal);

    const input = searchModal.querySelector('#global-search-input');
    const resultsContainer = searchModal.querySelector('#global-search-results');

    const openSearch = () => {
      searchModal.classList.add('open');
      setTimeout(() => input.focus(), 50);
    };

    const closeSearch = () => {
      searchModal.classList.remove('open');
      input.value = '';
    };

    // Atalhos de teclado (Ctrl + K ou /)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searchModal.classList.contains('open')) closeSearch();
        else openSearch();
      }
      if (e.key === 'Escape' && searchModal.classList.contains('open')) {
        closeSearch();
      }
    });

    // Clique fora fecha
    searchModal.addEventListener('click', (e) => {
      if (e.target === searchModal) closeSearch();
    });

    // Conecta botões com classe .btn-global-search ou inputs com ID #globalSearchTrigger
    document.querySelectorAll('.btn-global-search, #globalSearchTrigger').forEach((el) => {
      el.addEventListener('click', openSearch);
    });

    // Debounce na digitação da busca
    let debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const query = input.value.trim().toLowerCase();
      if (!query) {
        resultsContainer.innerHTML = '<div style="padding:var(--s4);text-align:center;color:var(--text-muted);font-size:var(--t-xs);">Digite para pesquisar em tempo real no JICS.</div>';
        return;
      }
      debounceTimer = setTimeout(() => performSearch(query, resultsContainer), 250);
    });
  }

  async function performSearch(query, container) {
    container.innerHTML = '<div style="padding:var(--s4);text-align:center;"><div class="skeleton" style="height:36px;margin-bottom:8px;"></div><div class="skeleton" style="height:36px;"></div></div>';
    try {
      const [modRes, jogRes] = await Promise.all([
        fetch('/modalidades').then((r) => r.json()).catch(() => []),
        fetch('/jics/jogos').then((r) => r.json()).catch(() => ({ jogos: [] }))
      ]);

      const modalidades = Array.isArray(modRes) ? modRes : [];
      const jogos = (jogRes && jogRes.jogos) || [];

      const matchedMods = modalidades.filter((m) => (m.nome || m.titulo || '').toLowerCase().includes(query));
      const matchedJogos = jogos.filter((j) => (j.equipe_a_nome || '').toLowerCase().includes(query) || (j.equipe_b_nome || '').toLowerCase().includes(query) || (j.modalidade_nome || '').toLowerCase().includes(query));

      if (matchedMods.length === 0 && matchedJogos.length === 0) {
        container.innerHTML = '<div style="padding:var(--s4);text-align:center;color:var(--text-muted);font-size:var(--t-sm);">Nenhum resultado encontrado para "<b>' + escapeHTML(query) + '</b>".</div>';
        return;
      }

      let html = '';
      if (matchedMods.length > 0) {
        html += '<div style="padding:var(--s2) var(--s4);font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Modalidades</div>';
        matchedMods.forEach((m) => {
          html += `
            <a href="/admin/modalidades.html" style="display:flex;align-items:center;gap:var(--s3);padding:10px var(--s4);border-radius:var(--r-md);transition:background var(--duration-fast);" onmouseover="this.style.background='var(--p-soft)'" onmouseout="this.style.background='transparent'">
              <span class="material-symbols-outlined text-primary">sports_basketball</span>
              <div>
                <strong style="font-size:var(--t-sm);color:var(--text-main);">${escapeHTML(m.nome || m.titulo)}</strong>
                <div style="font-size:var(--t-xs);color:var(--text-muted);">${escapeHTML(m.descricao || 'Modalidade esportiva')}</div>
              </div>
            </a>
          `;
        });
      }

      if (matchedJogos.length > 0) {
        html += '<div style="padding:var(--s2) var(--s4);font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-top:var(--s3);">Jogos & Partidas</div>';
        matchedJogos.slice(0, 5).forEach((j) => {
          html += `
            <a href="/admin/sumula.html?jogoId=${j.id}" style="display:flex;align-items:center;gap:var(--s3);padding:10px var(--s4);border-radius:var(--r-md);transition:background var(--duration-fast);" onmouseover="this.style.background='var(--p-soft)'" onmouseout="this.style.background='transparent'">
              <span class="material-symbols-outlined text-primary">sports</span>
              <div>
                <strong style="font-size:var(--t-sm);color:var(--text-main);">${escapeHTML(j.equipe_a_nome || 'Time A')} × ${escapeHTML(j.equipe_b_nome || 'Time B')}</strong>
                <div style="font-size:var(--t-xs);color:var(--text-muted);">${escapeHTML(j.modalidade_nome || 'Esporte')} · ${escapeHTML(j.quadra || 'Quadra')}</div>
              </div>
            </a>
          `;
        });
      }

      container.innerHTML = html;
    } catch {
      container.innerHTML = '<div style="padding:var(--s4);text-align:center;color:var(--color-error);font-size:var(--t-xs);">Erro ao realizar pesquisa.</div>';
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 8. CENTRAL DE NOTIFICAÇÕES
  // ══════════════════════════════════════════════════════════════
  function initNotifications() {
    if (notifDrawer) return;

    notifDrawer = document.createElement('div');
    notifDrawer.id = 'jics-notif-drawer';
    notifDrawer.className = 'modal-overlay';
    notifDrawer.innerHTML = `
      <div class="modal-content" style="max-width:400px;margin-left:auto;height:100vh;border-radius:var(--r-2xl) 0 0 var(--r-2xl);display:flex;flex-direction:column;padding:var(--s5);">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border-subtle);padding-bottom:var(--s4);margin-bottom:var(--s4);">
          <div style="display:flex;align-items:center;gap:var(--s2);">
            <span class="material-symbols-outlined text-primary">notifications</span>
            <h3 style="font-size:var(--t-lg);font-weight:700;">Notificações</h3>
          </div>
          <button type="button" class="btn-icon notif-close-btn" aria-label="Fechar">&times;</button>
        </div>
        <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:var(--s3);" id="notif-list">
          <div class="card" style="padding:var(--s4);border-left:4px solid var(--color-brand-secondary);">
            <div style="font-size:var(--t-xs);font-weight:700;color:var(--p-secondary);">JICS 2026</div>
            <div style="font-size:var(--t-sm);color:var(--text-main);margin-top:2px;">Bem-vindo à plataforma oficial de gestão dos Jogos Internos!</div>
            <div style="font-size:var(--t-2xs);color:var(--text-muted);margin-top:6px;">Agora mesmo</div>
          </div>
          <div class="card" style="padding:var(--s4);border-left:4px solid var(--color-gold);">
            <div style="font-size:var(--t-xs);font-weight:700;color:var(--color-gold);">Chaveamento Publicado</div>
            <div style="font-size:var(--t-sm);color:var(--text-main);margin-top:2px;">As tabelas das fases de grupos de Basquete e Futsal já estão disponíveis.</div>
            <div style="font-size:var(--t-2xs);color:var(--text-muted);margin-top:6px;">Hoje · 14:00</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(notifDrawer);

    const closeBtn = notifDrawer.querySelector('.notif-close-btn');
    const closeDrawer = () => notifDrawer.classList.remove('open');
    const openDrawer = () => notifDrawer.classList.add('open');

    closeBtn.addEventListener('click', closeDrawer);
    notifDrawer.addEventListener('click', (e) => {
      if (e.target === notifDrawer) closeDrawer();
    });

    document.querySelectorAll('.btn-notif-trigger').forEach((btn) => {
      btn.addEventListener('click', openDrawer);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 9. HELPERS E ESCAPE
  // ══════════════════════════════════════════════════════════════
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  // ══════════════════════════════════════════════════════════════
  // 10. INICIALIZAÇÃO AUTOMÁTICA & COMPATIBILIDADE GLOBAL
  // ══════════════════════════════════════════════════════════════
  function init() {
    initTheme();
    ensureToastContainer();
    initGlobalSearch();
    initNotifications();

    // Atualiza saudações automáticas em elementos com data-greeting
    document.querySelectorAll('[data-greeting]').forEach((el) => {
      el.textContent = getGreeting() + '!';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exportação unificada
  window.JICS_UI = {
    toast,
    confirm,
    showLoading,
    setButtonLoading,
    countUp,
    startCountdown,
    bumpScore,
    setTheme,
    toggleTheme,
    initTheme,
    initGlobalSearch,
    initNotifications,
    getGreeting,
    escapeHTML
  };

  // Compatibilidade com código legado
  window.showToast = toast;
  window.showToastSucesso = (msg) => toast({ type: 'success', message: msg });
  window.showToastErro = (msg) => toast({ type: 'error', message: msg });
  window.openConfirmModal = (opts) => confirm(opts);
  window.showLoading = showLoading;
  window.toggleTheme = toggleTheme;
  window.toast = (msg, type = 'info') => toast({ type, message: msg });
})();
