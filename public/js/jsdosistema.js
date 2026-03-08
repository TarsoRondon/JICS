let currentUser = null;
let modalidades = [];
let noticias = [];
let inscriptions = [];
let filteredInscriptions = [];
let currentInscription = null;
let senhaPendente = null;
let passwordUxModal = null;
let modalidadeEditId = null;
let sorteioRows = [];
let adminDataLoaded = false;
let adminActiveTab = localStorage.getItem('adminTab') || 'tabDashboard';
let adminCache = {
  inscricoes: [],
  usuarios: [],
  noticias: [],
  modalidades: [],
  jogos: []
};
const ADMIN_SIDEBAR_COLLAPSE_KEY = 'adminSidebarCollapsed';
let adminSidebarResizeBound = false;
let adminSidebarStickyObserver = null;
let dashboardModalidadeFiltroAtivo = 'todos';
let modalidadeSuggestionsApiReady = false;
let modalidadeSuggestionsSyncPromise = null;
let responsiveTableRaf = null;

function getPhotoStorageKey(matricula) {
  const key = String(matricula || '').trim();
  if (!key) return null;
  return `userPhoto:${key}`;
}

function applyStoredPhoto(user) {
  if (!user || user.foto) return;
  const key = getPhotoStorageKey(user.matricula);
  if (!key) return;
  const stored = localStorage.getItem(key);
  if (stored) user.foto = stored;
}

function formatPhoneMask(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (!digits) return '';
  if (digits.length < 3) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  const mobile = digits.length > 10;
  const part1Len = mobile ? 5 : 4;
  const part1 = rest.slice(0, part1Len);
  const part2 = rest.slice(part1Len, part1Len + 4);
  if (!part2) return `(${ddd}) ${part1}`;
  return `(${ddd}) ${part1}-${part2}`;
}

function shouldMaskPhone(input) {
  if (!input || input.dataset.phoneMask === '1') return false;
  if (input.dataset.mask === 'phone') return true;
  if (input.type === 'tel') return true;
  const key = `${input.id || ''} ${input.name || ''}`.toLowerCase();
  return ['telefone', 'celular', 'fone', 'tel'].some((term) => key.includes(term));
}

function bindPhoneMaskInput(input) {
  if (!shouldMaskPhone(input)) return;
  input.dataset.phoneMask = '1';
  input.addEventListener('input', () => {
    input.value = formatPhoneMask(input.value);
  });
  input.addEventListener('blur', () => {
    input.value = formatPhoneMask(input.value);
  });
}

function bindPhoneMasks(root = document) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('input').forEach(bindPhoneMaskInput);
}

function normalizeButtonsType(root = document) {
  if (!root) return;
  if (root.matches && root.matches('button:not([type])')) {
    root.type = 'button';
  }
  if (!root.querySelectorAll) return;
  root.querySelectorAll('button:not([type])').forEach((button) => {
    button.type = 'button';
  });
}

function bindHashActionLinks(root = document) {
  if (!root) return;
  const bindOne = (link) => {
    if (!link || link.dataset.hashBound === '1') return;
    link.dataset.hashBound = '1';
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
  };

  if (root.matches && root.matches('a[href="#"]')) {
    bindOne(root);
  }
  if (!root.querySelectorAll) return;
  root.querySelectorAll('a[href="#"]').forEach(bindOne);
}

function normalizeInteractiveElements(root = document) {
  normalizeButtonsType(root);
  bindHashActionLinks(root);
}

function renderGridSkeleton(target, count = 3) {
    if (!target) return;
    const cards = Array.from({ length: count }).map(() => `
    <div class="skeleton-card">
      <div class="skeleton-line lg"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line sm"></div>
    </div>
  `).join('');
    target.innerHTML = cards;
}

function renderEmptyState(target, title, subtitle) {
    if (!target) return;
    target.innerHTML = `
    <div class="empty-state">
      <span class="material-symbols-outlined">info</span>
      <h3>${title}</h3>
      <p>${subtitle}</p>
    </div>
  `;
}

function renderTableSkeleton(tbody, rows = 4, cols = 4) {
    if (!tbody) return;
    const lines = Array.from({ length: rows }).map(() => {
        const cells = Array.from({ length: cols }).map(() => `
      <td><div class="skeleton-line"></div></td>
    `).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
  tbody.innerHTML = lines;
}

const localLoaderState = {
  count: 0,
  shownAt: 0,
  timer: null,
  minDuration: 1200,
};

function createLocalLoaderFallback() {
  let loader = document.getElementById('global-loader-fallback');
  if (loader) return loader;
  loader = document.createElement('div');
  loader.id = 'global-loader-fallback';
  loader.className = 'modal hidden';
  loader.innerHTML = `
    <div class="modal-card">
      <div class="loader-card">
        <span class="spinner" aria-hidden="true"></span>
        <div class="loader-texts">
          <strong>Carregando</strong>
          <small id="global-loader-fallback-text">Aguarde um instante...</small>
        </div>
        <div class="loader-track" aria-hidden="true"><span></span></div>
      </div>
    </div>
  `;
  document.body.appendChild(loader);
  return loader;
}

function showGlobalLoading(show, message) {
  const nativeLoader = typeof window.showLoading === 'function' ? window.showLoading : null;
  if (nativeLoader) {
    nativeLoader(show, message);
    return;
  }

  const loader = createLocalLoaderFallback();
  const text = document.getElementById('global-loader-fallback-text');
  if (text) text.textContent = message || 'Aguarde um instante...';

  if (show) {
    localLoaderState.count += 1;
    clearTimeout(localLoaderState.timer);
    localLoaderState.timer = null;
    if (loader.classList.contains('hidden')) {
      loader.classList.remove('hidden');
      localLoaderState.shownAt = Date.now();
    }
    return;
  }

  localLoaderState.count = Math.max(0, localLoaderState.count - 1);
  if (localLoaderState.count > 0) return;

  const elapsed = Date.now() - localLoaderState.shownAt;
  const remaining = Math.max(0, localLoaderState.minDuration - elapsed);
  clearTimeout(localLoaderState.timer);
  localLoaderState.timer = setTimeout(() => {
    loader.classList.add('hidden');
    localLoaderState.timer = null;
  }, remaining);
}
function sanitizeFilename(value, fallback = 'arquivo') {
  const raw = String(value || fallback || 'arquivo');
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback || 'arquivo';
}

function escapeCsvValue(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvContent(rows, header) {
  const data = header ? [header, ...rows] : rows;
  const lines = data.map(row => row.map(escapeCsvValue).join(';')).join('\n');
  return `\uFEFF${lines}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadTextFile(content, filename, type) {
  const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8;' });
  downloadBlob(blob, filename);
}

function setSelectOptions(select, values, placeholder) {
    if (!select) return;
    const unique = Array.from(new Set(values.filter(Boolean))).sort();
    select.innerHTML = `<option value="">${placeholder}</option>` + unique.map(val => `<option value="${val}">${val}</option>`).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeDisplayText(value, fallback = '-') {
  if (value === undefined || value === null) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  if (!/[\u00C3\u00C2\u00E2\uFFFD]/.test(raw)) return raw;
  try {
    return decodeURIComponent(escape(raw));
  } catch (_) {
    return raw;
  }
}

function normalizeLookupValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function truncateText(value, max = 140) {
  const text = normalizeDisplayText(value, '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}...`;
}

function resolveModalidadeMeta(nome) {
  const normalized = normalizeLookupValue(nome);
  const rules = [
    { keys: ['futebol', 'futsal'], icon: 'sports_soccer', category: 'coletiva' },
    { keys: ['basquete', 'basket'], icon: 'sports_basketball', category: 'coletiva' },
    { keys: ['volei', 'volei de praia', 'volley'], icon: 'sports_volleyball', category: 'coletiva' },
    { keys: ['handebol'], icon: 'sports_handball', category: 'coletiva' },
    { keys: ['tenis', 'tenis de mesa'], icon: 'sports_tennis', category: 'individual' },
    { keys: ['atletismo', 'corrida', 'caminhada'], icon: 'directions_run', category: 'individual' },
    { keys: ['natacao'], icon: 'pool', category: 'individual' },
    { keys: ['xadrez'], icon: 'chess', category: 'individual' },
    { keys: ['judo', 'karate', 'jiu', 'capoeira', 'taekwondo'], icon: 'sports_kabaddi', category: 'individual' },
    { keys: ['academia', 'musculacao', 'fitness'], icon: 'fitness_center', category: 'individual' },
  ];
  for (const rule of rules) {
    if (rule.keys.some((k) => normalized.includes(k))) {
      return rule;
    }
  }
  return { icon: 'sports', category: 'coletiva' };
}

function bindDashboardModalidadeFilters() {
  const root = document.getElementById('dashboardModalidadeFilters');
  if (!root) return;
  const syncActive = () => {
    root.querySelectorAll('[data-mod-filter]').forEach((btn) => {
      const isActive = btn.dataset.modFilter === dashboardModalidadeFiltroAtivo;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  };
  if (root.dataset.bound !== '1') {
    root.dataset.bound = '1';
    root.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-mod-filter]');
      if (!btn) return;
      dashboardModalidadeFiltroAtivo = btn.dataset.modFilter || 'todos';
      syncActive();
      renderModalities();
    });
  }
  syncActive();
}

function getModalidadeIdSelecionada() {
    const select = document.getElementById('sorteioModalidade');
    if (!select || !select.value) return null;
    const value = select.value;
    const mod = (adminCache.modalidades || []).find(m =>
        String(m.id) === String(value) || m.nome === value || m.titulo === value
    );
    return mod ? mod.id : value;
}

function resolveModalidadeNome(value) {
    if (!value) return '';
    const mod = (adminCache.modalidades || []).find(m =>
        String(m.id) === String(value) || m.nome === value || m.titulo === value
    );
    return mod ? (mod.nome || mod.titulo) : String(value);
}

function normalizeRole(role) {
    const value = String(role || '').toUpperCase();
    if (value === 'ADMIN' || value === 'ADMINISTRADOR' || value === 'SUPER_ADMIN') return 'ADMIN';
    if (value === 'PROFESSOR') return 'PROFESSOR';
    return 'ALUNO';
}

function isAdminUser() {
    return currentUser && normalizeRole(currentUser.role) === 'ADMIN';
}

function isStaffUser() {
    const role = currentUser ? normalizeRole(currentUser.role) : 'ALUNO';
    return role === 'ADMIN' || role === 'PROFESSOR';
}

function shouldUseV0ResponsiveShell(page) {
    const pages = new Set(['admin', 'admin-cadastro', 'dashboard', 'modalidades', 'horarios', 'inscricoes', 'noticias', 'perfil', 'conta', 'resultados']);
    return pages.has(String(page || '').toLowerCase());
}

function ensureNavHamburgerButton() {
    const navbarLeft = document.querySelector('.navbar-left');
    if (!navbarLeft) return;
    if (navbarLeft.querySelector('.nav-hamburger')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn nav-hamburger';
    button.setAttribute('aria-label', 'Abrir menu');
    button.innerHTML = '<span class="material-symbols-outlined">menu</span>';
    button.addEventListener('click', toggleSideNav);

    const brand = navbarLeft.querySelector('.navbar-brand');
    if (brand) {
        navbarLeft.insertBefore(button, brand);
        return;
    }
    navbarLeft.prepend(button);
}

function buildDefaultSideNavMarkup() {
    return `
      <div class="side-header">
        <span class="side-header-title">Menu</span>
      </div>
      <a class="side-link" href="dashboard.html">Inicio</a>
      <a class="side-link user-only" href="inscricoes.html">Inscricoes</a>
      <a class="side-link user-only" href="modalidades.html">Modalidades</a>
      <a class="side-link" href="horarios.html">Horarios</a>
      <a class="side-link" href="noticias.html">Noticias</a>
      <a class="side-link" href="resultados.html">Resultados</a>
      <a class="side-link" href="perfil.html">Perfil</a>
      <a class="side-link staff-only" href="admin.html">Administracao</a>
    `;
}

function ensureV0ShellScaffold(page) {
    const shell = document.getElementById('appShell');
    const appBody = shell?.querySelector('.app-body');
    if (!shell || !appBody) return;
    if (!shouldUseV0ResponsiveShell(page)) return;

    let sideNav = document.getElementById('sideNav');
    if (!sideNav) {
        sideNav = document.createElement('aside');
        sideNav.id = 'sideNav';
        sideNav.className = 'side-drawer';
        sideNav.innerHTML = buildDefaultSideNavMarkup();
        appBody.insertBefore(sideNav, appBody.firstChild);
    }

    if (sideNav) {
        document.body.classList.remove('no-drawer');
        ensureNavHamburgerButton();
    }

    if (sideNav && !document.getElementById('sideOverlay')) {
        const sideOverlay = document.createElement('div');
        sideOverlay.id = 'sideOverlay';
        sideOverlay.className = 'overlay';
        const drawerOverlay = document.getElementById('drawerOverlay');
        if (drawerOverlay && drawerOverlay.parentElement === shell) {
            shell.insertBefore(sideOverlay, drawerOverlay);
        } else {
            shell.appendChild(sideOverlay);
        }
    }
}

function ensureSideNavLinks() {
    const sideNav = document.getElementById('sideNav');
    if (!sideNav) return;
    if (document.body.classList.contains('admin-ui')) return;

    const addLink = (href, label, className) => {
        if (sideNav.querySelector(`a[href='${href}']`)) return;
        const link = document.createElement('a');
        link.href = href;
        link.className = `side-link ${className || ''}`.trim();
        link.textContent = label;
        sideNav.appendChild(link);
    };

    addLink('inscricoes.html', 'Minhas inscrições', 'user-only');
    addLink('admin.html', 'Administração', 'staff-only');

    sideNav.querySelectorAll('.side-link').forEach((link) => {
        const href = link.getAttribute('href') || '';
        if (href.includes('inscricoes.html') || href.includes('modalidades.html')) {
            link.classList.add('user-only');
        }
        if (href.includes('admin.html')) {
            link.classList.add('staff-only');
        }
    });

    const currentFile = String(location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
    sideNav.querySelectorAll('a.side-link[href]').forEach((link) => {
        const href = String(link.getAttribute('href') || '').toLowerCase();
        link.classList.toggle('active', href === currentFile);
    });
}

function normalizeLabelKey(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function resolveSideLinkIcon(link, label) {
    const href = normalizeLabelKey(link?.getAttribute('href') || '');
    const tab = normalizeLabelKey(link?.dataset?.tab || '');
    const key = `${href} ${tab} ${normalizeLabelKey(label)}`;

    if (key.includes('dashboard') || key.includes('inicio') || key.includes('visao geral')) return 'home';
    if (key.includes('modalidade')) return 'sports_soccer';
    if (key.includes('inscric')) return 'assignment';
    if (key.includes('noticia')) return 'campaign';
    if (key.includes('resultado') || key.includes('ranking')) return 'leaderboard';
    if (key.includes('horario')) return 'schedule';
    if (key.includes('perfil') || key.includes('aluno')) return 'person';
    if (key.includes('sorteio')) return 'shuffle';
    if (key.includes('sumula')) return 'fact_check';
    if (key.includes('usuario')) return 'group';
    if (key.includes('evento')) return 'event';
    if (key.includes('organizad')) return 'badge';
    if (key.includes('admin')) return 'admin_panel_settings';
    if (key.includes('grafico')) return 'monitoring';
    if (key.includes('log')) return 'receipt_long';
    if (key.includes('conta')) return 'settings';
    return 'chevron_right';
}

function enhanceSideNavIcons() {
    const sideNav = document.getElementById('sideNav');
    if (!sideNav) return;

    sideNav.querySelectorAll('a.side-link').forEach((link) => {
        if (link.dataset.iconReady === '1') return;

        const label = String(link.textContent || '').trim() ||
            String(link.getAttribute('aria-label') || '').trim() ||
            'Link';
        const iconName = resolveSideLinkIcon(link, label);

        link.dataset.iconReady = '1';
        link.textContent = '';

        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined side-link-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = iconName;

        const text = document.createElement('span');
        text.className = 'side-link-text';
        text.textContent = label;

        link.append(icon, text);
        link.setAttribute('aria-label', label);
        link.setAttribute('title', label);
    });
}

function ensureSiteFooter() {
    if (document.querySelector('.site-footer')) return;

    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = `
    <div class="footer-left">
      <span>&copy; 2015</span>
      <a href="https://gesstec.org/" target="_blank" rel="noopener">GESSTEC - IFRO</a>
      <span>Todos os direitos reservados.</span>
    </div>
    <div class="footer-right">
      &copy; 2026 IFRO ESPORTES
      <span>Sistema institucional</span>
    </div>
  `;
    const shell = document.getElementById('appShell') || document.body;
    const anchor = shell.querySelector('#sideOverlay') || shell.querySelector('#drawerOverlay');
    if (anchor && anchor.parentElement === shell) {
        shell.insertBefore(footer, anchor);
        return;
    }
    shell.appendChild(footer);
}

function isTabletLandscapePinnedDrawerMode() {
    return window.matchMedia('(min-width: 768px) and (max-width: 1024px) and (orientation: landscape)').matches;
}

function isSideDrawerOverlayMode() {
    return !isDesktopSidebarViewport() && !isTabletLandscapePinnedDrawerMode();
}

function isUserDrawerOverlayMode() {
    return window.matchMedia('(max-width: 1024px)').matches;
}

function closeSideNav() {
    const nav = document.getElementById('sideNav');
    const overlay = document.getElementById('sideOverlay');
    if (nav) nav.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    document.body.classList.remove('side-drawer-open');
}

function closeUserDrawer() {
    const drawer = document.getElementById('userDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    document.body.classList.remove('user-drawer-open');
}

function setSideNavState(open) {
    const nav = document.getElementById('sideNav');
    const overlay = document.getElementById('sideOverlay');
    if (!nav) return;
    const shouldOpen = Boolean(open) && isSideDrawerOverlayMode();
    nav.classList.toggle('open', shouldOpen);
    if (overlay) overlay.classList.toggle('active', shouldOpen);
    document.body.classList.toggle('side-drawer-open', shouldOpen);
}

function setUserDrawerState(open) {
    const drawer = document.getElementById('userDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (!drawer) return;
    const shouldOpen = Boolean(open);
    drawer.classList.toggle('open', shouldOpen);
    document.body.classList.toggle('user-drawer-open', shouldOpen);
    if (overlay) {
        const shouldOverlay = shouldOpen && isUserDrawerOverlayMode();
        overlay.classList.toggle('active', shouldOverlay);
    }
}

function syncResponsiveLayoutMode() {
    const body = document.body;
    if (!body) return;
    body.classList.toggle('side-drawer-overlay-mode', isSideDrawerOverlayMode());
    body.classList.toggle('user-drawer-overlay-mode', isUserDrawerOverlayMode());
    body.classList.toggle('tablet-mini-nav-mode', isTabletLandscapePinnedDrawerMode());

    if (!isSideDrawerOverlayMode()) {
        closeSideNav();
    }
    if (!isUserDrawerOverlayMode()) {
        const overlay = document.getElementById('drawerOverlay');
        if (overlay) overlay.classList.remove('active');
    }
}

function bindDrawerGestures() {
    const bindSwipe = (element, direction, onSwipe) => {
        if (!element || element.dataset.swipeBound === '1') return;
        element.dataset.swipeBound = '1';

        let startX = 0;
        let startY = 0;
        let tracking = false;

        element.addEventListener('touchstart', (event) => {
            if (!event.touches || event.touches.length !== 1) return;
            const touch = event.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            tracking = true;
        }, { passive: true });

        element.addEventListener('touchmove', (event) => {
            if (!tracking || !event.touches || event.touches.length !== 1) return;
            const touch = event.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            if (Math.abs(dx) < Math.abs(dy)) return;

            if (direction === 'left' && dx <= -70) {
                tracking = false;
                onSwipe();
            }
            if (direction === 'right' && dx >= 70) {
                tracking = false;
                onSwipe();
            }
        }, { passive: true });

        element.addEventListener('touchend', () => {
            tracking = false;
        }, { passive: true });
    };

    bindSwipe(document.getElementById('sideNav'), 'left', closeSideNav);
    bindSwipe(document.getElementById('userDrawer'), 'right', closeUserDrawer);
}

function bindEdgeSwipeOpen() {
    if (document.body.dataset.edgeSwipeBound === '1') return;
    document.body.dataset.edgeSwipeBound = '1';

    let edge = null;
    let startX = 0;
    let startY = 0;

    document.addEventListener('touchstart', (event) => {
        if (!event.touches || event.touches.length !== 1) return;
        const touch = event.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        edge = null;

        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        if (startX <= 24) edge = 'left';
        if (startX >= viewportWidth - 24) edge = 'right';
    }, { passive: true });

    document.addEventListener('touchend', (event) => {
        if (!edge || !event.changedTouches || event.changedTouches.length !== 1) {
            edge = null;
            return;
        }

        const touch = event.changedTouches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 72) {
            edge = null;
            return;
        }

        if (edge === 'left' && dx > 0 && isSideDrawerOverlayMode()) {
            setSideNavState(true);
            closeUserDrawer();
        }

        if (edge === 'right' && dx < 0 && isUserDrawerOverlayMode()) {
            setUserDrawerState(true);
            if (isSideDrawerOverlayMode()) closeSideNav();
        }

        edge = null;
    }, { passive: true });
}

function attachDrawerShortcuts() {
    if (document.body.dataset.drawerShortcutBound === '1') return;
    document.body.dataset.drawerShortcutBound = '1';
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        closeSideNav();
        closeUserDrawer();
        closeAdminMenu();
    });
}

function shouldRenderMobileBottomNav(page) {
    if (!currentUser) return false;
    if (!page) return false;
    if (document.body.classList.contains('admin-ui')) return false;
    const blocked = new Set([
        'admin',
        'painel-sorteio',
        'sumula',
        'sumula-mobile',
        'sorteios-salvos',
        'login',
        'solicitar-otp',
        'validar-otp',
        'redefinir-senha',
        'recuperar-matricula',
        'recuperacao',
        'gov-callback'
    ]);
    return !blocked.has(page);
}

function renderMobileBottomNav(page) {
    const existing = document.getElementById('mobileBottomNav');
    if (existing) existing.remove();

    if (!shouldRenderMobileBottomNav(page)) {
        document.body.classList.remove('with-mobile-nav');
        return;
    }

    const items = [
        { href: 'dashboard.html', key: 'dashboard', label: 'Inicio', icon: 'home' },
        { href: 'modalidades.html', key: 'modalidades', label: 'Modalidades', icon: 'sports_soccer' },
        { href: 'inscricoes.html', key: 'inscricoes', label: 'Inscricoes', icon: 'assignment' },
        { href: 'noticias.html', key: 'noticias', label: 'Noticias', icon: 'campaign' },
        { href: 'perfil.html', key: 'perfil', label: 'Perfil', icon: 'person' }
    ];

    const nav = document.createElement('nav');
    nav.id = 'mobileBottomNav';
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Navegacao principal mobile');
    nav.innerHTML = items.map((item) => `
      <a href="${item.href}" class="mobile-bottom-link ${page === item.key ? 'active' : ''}">
        <span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span>
        <span>${item.label}</span>
      </a>
    `).join('');

    const shell = document.getElementById('appShell') || document.body;
    shell.appendChild(nav);
    document.body.classList.add('with-mobile-nav');
}

function enhanceTableForMobileCards(table) {
    if (!table || table.dataset.noMobileCards === '1') return;
    if (!table.classList.contains('table')) return;

    const headers = Array.from(table.querySelectorAll('thead th'))
        .map((th) => String(th.textContent || '').trim())
        .filter(Boolean);
    if (!headers.length) return;

    table.classList.add('table-mobile-cards');
    table.querySelectorAll('tbody tr').forEach((row) => {
        row.querySelectorAll('td').forEach((cell, index) => {
            if (cell.hasAttribute('colspan')) {
                cell.removeAttribute('data-label');
                return;
            }
            const label = headers[index] || `Coluna ${index + 1}`;
            cell.setAttribute('data-label', label);
        });
    });
}

function applyResponsiveTableCards(root = document) {
    if (!root) return;
    const tables = [];
    if (root.matches && root.matches('table.table')) tables.push(root);
    if (root.querySelectorAll) {
        root.querySelectorAll('table.table').forEach((table) => tables.push(table));
    }
    tables.forEach(enhanceTableForMobileCards);
}

function scheduleResponsiveTableCards() {
    if (responsiveTableRaf) cancelAnimationFrame(responsiveTableRaf);
    responsiveTableRaf = requestAnimationFrame(() => {
        responsiveTableRaf = null;
        applyResponsiveTableCards(document);
    });
}

function applyRoleVisibility() {
    document.querySelectorAll('.admin-only').forEach(el => {
        el.classList.toggle('hidden', !isAdminUser());
    });
    document.querySelectorAll('.staff-only').forEach(el => {
        el.classList.toggle('hidden', !isStaffUser());
    });
    document.querySelectorAll('.user-only').forEach(el => {
        el.classList.toggle('hidden', isStaffUser());
    });

    if (!document.body.classList.contains('admin-ui')) {
        document.querySelectorAll('a[href="admin.html"]').forEach((link) => {
            const label = 'Administração';
            const textNode = link.querySelector('.side-link-text');
            if (textNode) {
                textNode.textContent = label;
                link.setAttribute('aria-label', label);
                link.setAttribute('title', label);
                return;
            }
            link.textContent = label;
        });
    }
}

const modalSelectors = {
    detail: 'detailModal',
    newsView: 'modalVerNoticia',
    newsEdit: 'modalEditarNoticia',
    newsDelete: 'modalExcluir',
    senha: 'modalSenha',
    confirmSenha: 'modalConfirmarSenha',
    foto: 'modalFoto',
};

const tourState = {
    active: false,
    type: null,
    step: 0,
};

const tourSteps = {
    inscricao: [
        { selector: '.nav-hamburger', title: 'Menu rápido', text: 'Use o menu lateral para navegar pelas páginas.' },
        { selector: '.hero-actions .btn-primary', title: 'Inscrição', text: 'Clique aqui para ir para a página de modalidades.', page: 'modalidades.html' },
        { selector: '#allModalidadesGrid', title: 'Modalidades', text: 'Escolha uma modalidade e confirme a inscrição.' },
    ],
    senha: [
        { selector: '.user-trigger', title: 'Menu do usuário', text: 'Clique no avatar para abrir o menu.' },
        { selector: '.drawer-btn', title: 'Perfil', text: 'Acesse o perfil para alterar a senha.', page: 'perfil.html' },
        { selector: '.profile-card .btn-primary', title: 'Alterar senha', text: 'Clique para abrir o modal de troca de senha.' },
    ],
    foto: [
        { selector: '.user-trigger', title: 'Menu do usuário', text: 'Abra o menu lateral do usuário.' },
        { selector: '.drawer-sub-btn', title: 'Alterar foto', text: 'Clique em "Alterar foto" para abrir o modal.' },
        { selector: '#photoInput', title: 'Prévia', text: 'Envie a foto e ajuste com zoom e posição.' },
    ],
    resultados: [
        { selector: '.drawer-btn', title: 'Resultados', text: 'Acesse a página de resultados pelo menu.', page: 'resultados.html' },
        { selector: '.filter-bar', title: 'Filtros', text: 'Use filtros e busca para localizar partidas.' },
        { selector: '.btn-outline', title: 'Baixar CSV', text: 'Clique aqui para baixar os resultados.' },
    ],
    completo: [
        { selector: '.navbar-brand', title: 'Topo rápido', text: 'Clique no IFRO ESPORTES para voltar ao topo.' },
        { selector: '.hero-actions .btn-primary', title: 'Inscrições', text: 'Comece pelas modalidades.', page: 'modalidades.html' },
        { selector: '.cards-grid', title: 'Modalidades', text: 'Confira as modalidades disponíveis.' },
        { selector: '.drawer-btn', title: 'Resultados', text: 'Acesse os resultados no menu.', page: 'resultados.html' },
    ],
};

function loadUserFromStorage() {
    const saved = sessionStorage.getItem('usuarioLogado');
    if (saved) {
        currentUser = JSON.parse(saved);
        applyStoredPhoto(currentUser);
        sessionStorage.setItem('usuarioLogado', JSON.stringify(currentUser));
        return;
    }
    if (localStorage.getItem('usuarioLogado')) {
        localStorage.removeItem('usuarioLogado');
    }
    currentUser = null;
}

async function ensureUserFromApi() {
    if (!currentUser || currentUser?.sexo) return;
    if (!currentUser.matricula) return;
    try {
        const res = await fetch(`/admin/aluno/${encodeURIComponent(currentUser.matricula)}`);
        if (!res.ok) return;
        const data = await res.json();
        currentUser = { ...currentUser, ...data };
        applyStoredPhoto(currentUser);
        sessionStorage.setItem('usuarioLogado', JSON.stringify(currentUser));
    } catch (_) {
        // silencioso para não quebrar UX se offline
    }
}

function resolveGreeting() {
    if (!currentUser || !currentUser.sexo) return 'Bem-vindo(a) ao IFRO ESPORTES!';
    const sexo = String(currentUser.sexo).toUpperCase();
    return sexo === 'F' ? 'Bem-vinda ao IFRO ESPORTES!' : 'Bem-vindo ao IFRO ESPORTES!';
}

function applyHeroGreeting() {
    const el = document.getElementById('heroGreeting');
    if (el) el.textContent = resolveGreeting();
}

function initTheme() {
    const savedTheme = sessionStorage.getItem('tema') || 'light';
    document.body.dataset.theme = savedTheme;
    const label = document.getElementById('themeLabel');
    if (label) label.textContent = savedTheme === 'dark' ? 'Escuro' : 'Claro';
}

async function loadSharedModals() {
    const container = document.getElementById('globalModals');
    if (!container) return;
    try {
        const res = await fetch('partials/modals.html');
        const html = await res.text();
        container.innerHTML = html;
    } catch (err) {
        console.warn('Falha ao carregar modais', err);
    }
}

let passwordUxReady = null;

function ensurePasswordUx() {
    if (window.setupPasswordUX) return Promise.resolve();
    if (passwordUxReady) return passwordUxReady;
    passwordUxReady = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'js/password-ux.js';
        script.onload = () => resolve();
        script.onerror = () => resolve();
        document.head.appendChild(script);
    });
    return passwordUxReady;
}

function initPasswordUxModal() {
    if (typeof window.setupPasswordUX !== 'function') return;
    passwordUxModal = window.setupPasswordUX({
        passwordId: 'novaSenhaInput',
        confirmId: 'confirmarSenhaInput',
        buttonId: 'btnSalvarSenha',
        rulesId: 'rulesModalSenha',
        strengthBarId: 'strengthBarModalSenha',
        strengthTextId: 'strengthTextModalSenha',
        matchId: 'matchModalSenha'
    });
}

function scrollToTop() {
    const page = document.body.dataset.page;
    if (page && page !== 'dashboard') {
        location.href = 'dashboard.html';
        return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleSideNav() {
    const nav = document.getElementById('sideNav');
    if (!nav) return;
    const willOpen = !document.body.classList.contains('side-drawer-open');
    setSideNavState(willOpen);
    if (willOpen) closeUserDrawer();
    closeAdminMenu();
}

function isDesktopSidebarViewport() {
    return window.matchMedia('(min-width: 1025px)').matches;
}

function updateAdminSidebarStickyOffset() {
    if (document.body?.dataset?.page !== 'admin') return;
    const navbar = document.querySelector('.navbar');
    const banner = document.getElementById('sessionBanner');
    const navHeight = navbar ? Math.ceil(navbar.getBoundingClientRect().height) : 0;
    const hasBanner = Boolean(banner && !banner.classList.contains('hidden'));
    const bannerHeight = hasBanner ? Math.ceil(banner.getBoundingClientRect().height) : 0;
    const spacing = 12;
    const offset = navHeight + bannerHeight + spacing;
    document.body.style.setProperty('--admin-sticky-offset', `${Math.max(offset, 72)}px`);
}

function setSidebarCollapsed(collapsed, persist = true) {
    if (document.body?.dataset?.page !== 'admin') return;

    const shouldCollapse = Boolean(collapsed) && isDesktopSidebarViewport();
    document.body.classList.toggle('admin-sidebar-collapsed', shouldCollapse);

    const btn = document.getElementById('sideCollapseBtn');
    if (btn) {
        btn.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');
        btn.setAttribute('aria-label', shouldCollapse ? 'Expandir barra lateral' : 'Recolher barra lateral');
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = shouldCollapse ? 'chevron_right' : 'chevron_left';
    }

    if (persist) {
        try {
            localStorage.setItem(ADMIN_SIDEBAR_COLLAPSE_KEY, shouldCollapse ? '1' : '0');
        } catch (_) {}
    }
}

function toggleSidebarCollapse() {
    if (document.body?.dataset?.page !== 'admin') return;
    const next = !document.body.classList.contains('admin-sidebar-collapsed');
    setSidebarCollapsed(next, true);
}

function initSidebarCollapse() {
    if (document.body?.dataset?.page !== 'admin') return;
    updateAdminSidebarStickyOffset();
    const storedCollapsed = localStorage.getItem(ADMIN_SIDEBAR_COLLAPSE_KEY) === '1';
    setSidebarCollapsed(storedCollapsed, false);

    const banner = document.getElementById('sessionBanner');
    if (banner && !adminSidebarStickyObserver) {
        adminSidebarStickyObserver = new MutationObserver(() => {
            updateAdminSidebarStickyOffset();
        });
        adminSidebarStickyObserver.observe(banner, {
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    }

    if (!adminSidebarResizeBound) {
        adminSidebarResizeBound = true;
        window.addEventListener('resize', () => {
            if (document.body?.dataset?.page !== 'admin') return;
            updateAdminSidebarStickyOffset();
            const preferredCollapsed = localStorage.getItem(ADMIN_SIDEBAR_COLLAPSE_KEY) === '1';
            setSidebarCollapsed(preferredCollapsed, false);
        });
    }
}

function toggleUserDrawer() {
    const drawer = document.getElementById('userDrawer');
    if (!drawer) return;
    const willOpen = !document.body.classList.contains('user-drawer-open');
    setUserDrawerState(willOpen);
    if (willOpen) closeSideNav();
}

function bindDrawerOverlays() {
    const sideOverlay = document.getElementById('sideOverlay');
    if (sideOverlay && sideOverlay.dataset.bound !== '1') {
        sideOverlay.dataset.bound = '1';
        sideOverlay.addEventListener('click', () => {
            closeSideNav();
        });
    }

    const drawerOverlay = document.getElementById('drawerOverlay');
    if (drawerOverlay && drawerOverlay.dataset.bound !== '1') {
        drawerOverlay.dataset.bound = '1';
        drawerOverlay.addEventListener('click', () => {
            closeUserDrawer();
        });
    }
}

function toggleDrawerGroup(id, btn) {
    const target = document.getElementById(id);
    if (!target) return;
    target.classList.toggle('open');
    if (btn) btn.classList.toggle('open');
}

function toggleTheme() {
    const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = nextTheme;
    sessionStorage.setItem('tema', nextTheme);
    const label = document.getElementById('themeLabel');
    if (label) label.textContent = nextTheme === 'dark' ? 'Escuro' : 'Claro';
}

function toggleHelpPanel() {
    const panel = document.getElementById('helpPanel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    closeAdminMenu();
}

function collectModalidadeNames(list = []) {
  return Array.from(new Set(
    (list || [])
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        return String(item?.nome || item?.titulo || '').trim();
      })
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

function renderModNomeSuggestions(names = []) {
  const datalist = document.getElementById('modNomeSuggestions');
  if (!datalist) return;
  datalist.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
}

function refreshModNomeSuggestionsFromCache() {
  const names = collectModalidadeNames(adminCache.modalidades || []);
  if (!names.length) return;
  renderModNomeSuggestions(names);
}

async function refreshModNomeSuggestionsFromApi(force = false) {
  const datalist = document.getElementById('modNomeSuggestions');
  if (!datalist) return;
  if (modalidadeSuggestionsApiReady && !force) return;
  if (modalidadeSuggestionsSyncPromise) return modalidadeSuggestionsSyncPromise;

  modalidadeSuggestionsSyncPromise = (async() => {
    try {
      let response = await fetch('/api/modalidades', { credentials: 'include' });
      if (!response.ok) {
        response = await fetch('/modalidades', { credentials: 'include' });
      }
      if (!response.ok) return;
      const rows = await response.json();
      const names = collectModalidadeNames(rows);
      if (!names.length) return;
      renderModNomeSuggestions(names);
      modalidadeSuggestionsApiReady = true;
    } catch (_) {
      // fallback silencioso para não bloquear o fluxo do admin
    } finally {
      modalidadeSuggestionsSyncPromise = null;
    }
  })();

  return modalidadeSuggestionsSyncPromise;
}

// ---------- Admin helper: fill selects ----------
function preencherSelectsAdmin() {
  // Modalidades em filtros e sorteio
  const modOpts = (adminCache.modalidades || []).map(m => m.nome || m.titulo).filter(Boolean);
  setSelectOptions(document.getElementById('filtInscModalidade'), modOpts, 'Modalidade');
  setSelectOptions(document.getElementById('filtInscTurma'), adminCache.inscricoes.map(i => i.turma).filter(Boolean), 'Turma');
  setSelectOptions(document.getElementById('filtInscCampus'), adminCache.inscricoes.map(i => i.campus).filter(Boolean), 'Campus');
  setSelectOptions(document.getElementById('sorteioModalidade'), modOpts, 'Modalidade');
  setSelectOptions(document.getElementById('sumulaJogo'), (adminCache.jogos||[]).map(j => j.jogo || j.numero_jogo).filter(Boolean), 'Selecione o jogo');
  refreshModNomeSuggestionsFromCache();
  void refreshModNomeSuggestionsFromApi();
}

function toggleAdminMenu(evt) {
    const menu = document.getElementById('adminMenuDropdown');
    const overlay = document.getElementById('adminMenuOverlay');
    if (!menu || !overlay) return;
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !willOpen);
    overlay.classList.toggle('hidden', !willOpen);
    if (evt) evt.stopPropagation();
}

function closeAdminMenu() {
    const menu = document.getElementById('adminMenuDropdown');
    const overlay = document.getElementById('adminMenuOverlay');
    if (menu) menu.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
}

function setupPasswordRecoveryModal() {
    const modal = document.getElementById('passwordRecoveryModal');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closePasswordRecoveryModal();
    });
}

function openPasswordRecoveryModal(targetUrl) {
    const modal = document.getElementById('passwordRecoveryModal');
    if (!modal) {
        location.href = targetUrl || '/solicitar-otp.html';
        return;
    }
    const card = modal.querySelector('.password-recovery-card');
    const isCompact = targetUrl && targetUrl.includes('primeiro-acesso.html');
    modal.classList.toggle('compact', !!isCompact);
    if (card) {
        card.classList.toggle('compact', !!isCompact);
    }
    const frame = document.getElementById('passwordRecoveryFrame');
    if (frame) frame.src = targetUrl || '/solicitar-otp.html';
    modal.classList.remove('hidden');
}

function closePasswordRecoveryModal() {
    const modal = document.getElementById('passwordRecoveryModal');
    if (!modal) return;
    modal.classList.add('hidden');
    const frame = document.getElementById('passwordRecoveryFrame');
    if (frame) frame.src = '/solicitar-otp.html';
}

function attachPasswordRecoveryLinks() {
    document.querySelectorAll('.password-recovery-link').forEach((link) => {
        if (link.dataset.bound === '1') return;
        link.dataset.bound = '1';
        link.addEventListener('click', (event) => {
            event.preventDefault();
            openPasswordRecoveryModal(link.getAttribute('href'));
        });
    });
}

function renderDrawer() {
    const drawer = document.getElementById('userDrawer');
    if (!drawer) return;
    const adminLabel = 'Administração';
    const modalidadesGroup = isStaffUser() ?
        '' :
        `
      <button class="drawer-btn drawer-toggle" onclick="toggleDrawerGroup('drawerModalidades', this)">
        Modalidades
        <span class="material-symbols-outlined">expand_more</span>
      </button>
      <div id="drawerModalidades" class="drawer-sub">
        <button class="drawer-sub-btn" onclick="openMinhasInscricoes()">Minhas inscrições</button>
        <button class="drawer-sub-btn" onclick="location.href='modalidades.html'">Ver modalidades</button>
      </div>
    `;

    drawer.innerHTML = `
    <div class="drawer-header">
      <button class="icon-btn drawer-close" onclick="toggleUserDrawer()">
        <span class="material-symbols-outlined">close</span>
        <span class="drawer-close-text">Fechar</span>
      </button>
      <div class="drawer-user">
        <img id="drawerAvatar" class="drawer-avatar" src="${currentUser?.foto || '/assets/avatar-default.png'}" alt="Avatar" onerror="this.src='/assets/avatar-default.png'" />
        <div>
          <p id="drawerUserName">${currentUser?.nome || 'Usuário'}</p>
          <small id="drawerUserMatricula">${currentUser?.matricula || ''}</small>
        </div>
      </div>
    </div>
    <div class="drawer-section">
      <div class="drawer-group-title">Menu</div>
      <button class="drawer-btn" onclick="location.href='dashboard.html'">Início</button>
      <button class="drawer-btn" onclick="location.href='perfil.html'">Perfil</button>
      ${modalidadesGroup}
      <button class="drawer-btn" onclick="location.href='noticias.html'">Notícias</button>
      <button class="drawer-btn" onclick="location.href='horarios.html'">Horários</button>
      <button class="drawer-btn" onclick="location.href='resultados.html'">Resultados</button>
      ${isStaffUser() ? `<button class="drawer-btn" onclick="location.href='admin.html'">${adminLabel}</button>` : ''}
      ${isAdminUser() ? `<button class="drawer-btn" onclick="location.href='/sumula.html'">Súmula</button>` : ''}
    </div>
    <div class="drawer-footer">
      <div class="drawer-group-title">Configurações</div>
      <button class="drawer-btn drawer-toggle" onclick="toggleDrawerGroup('drawerConfig', this)">
        Configurações
        <span class="material-symbols-outlined">expand_more</span>
      </button>
      <div id="drawerConfig" class="drawer-sub">
        <button class="drawer-sub-btn" onclick="openPhotoModal()">Alterar foto</button>
        <a class="drawer-sub-btn" href="recuperacao.html#reset">Recuperar senha</a>
        <a class="drawer-sub-btn" href="recuperar-matricula.html">Recuperar matrícula</a>
        <button class="drawer-sub-btn" onclick="editarSenha()">Alterar senha</button>
        <a class="drawer-sub-btn" href="conta.html">Alterar telefone</a>
        <button class="drawer-sub-btn" onclick="toggleHelpPanel()">FAQ / Ajuda</button>
        <a class="drawer-sub-btn" href="suporte.html">Suporte</a>
        <a class="drawer-sub-btn" href="privacidade.html">Privacidade</a>
        <a class="drawer-sub-btn" href="termos.html">Termos</a>
        <div class="drawer-theme">
          <span>Tema</span>
          <button class="theme-toggle" onclick="toggleTheme()">
            <span id="themeLabel">${document.body.dataset.theme === 'dark' ? 'Escuro' : 'Claro'}</span>
            <span class="material-symbols-outlined">dark_mode</span>
          </button>
        </div>
      </div>
      <button class="drawer-btn drawer-danger" onclick="logout()">Sair</button>
    </div>
  `;

  const avatar = document.getElementById('userAvatar');
  if (avatar) avatar.src = currentUser?.foto || '/assets/avatar-default.png';
  const name = document.getElementById('userNameNavbar');
  if (name) animateUserName(currentUser?.nome || '');
  const userMenu = document.querySelector('.user-menu');
  if (userMenu) userMenu.classList.remove('hidden');

  attachPasswordRecoveryLinks();
}

function setNavbarGuest() {
  const userMenu = document.querySelector('.user-menu');
  if (userMenu) userMenu.classList.add('hidden');
  const name = document.getElementById('userNameNavbar');
  if (name) name.textContent = '';
  const avatar = document.getElementById('userAvatar');
  if (avatar) avatar.src = '/assets/avatar-default.png';
}

let nameTypeTimer = null;
function animateUserName(text) {
  const el = document.getElementById('userNameNavbar');
  if (!el) return;
  const safeText = String(text || '').trim();
  if (!safeText) {
    el.textContent = '';
    return;
  }
  if (nameTypeTimer) clearInterval(nameTypeTimer);
  el.innerHTML = `<span class="user-name-text"></span><span class="user-cursor">_</span>`;
  const textEl = el.querySelector('.user-name-text');
  let i = 0;
  nameTypeTimer = setInterval(() => {
    textEl.textContent = safeText.slice(0, i + 1);
    i += 1;
    if (i >= safeText.length) {
      clearInterval(nameTypeTimer);
      nameTypeTimer = null;
    }
  }, 35);
}

function togglePassword() {
  const input = document.getElementById('senha');
  const icon = document.querySelector('.login-v2__toggle .material-symbols-outlined');
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  if (icon) icon.textContent = isHidden ? 'visibility_off' : 'visibility';
}

function entrarGovBr() {
  fetch('/auth/govbr/authorize')
    .then(res => res.json())
    .then(data => {
      if (!data.ok || !data.url) {
        mostrarToastAtencao(data.message || 'Gov.br indisponível.');
        return;
      }
      window.location.href = data.url;
    })
    .catch(() => {
      mostrarToastAtencao('Falha ao iniciar gov.br.');
    });
}

function handleLogin(event) {
  event.preventDefault();
  const usuarioInput = document.getElementById('usuario');
  const senhaInput = document.getElementById('senha');
  const submitBtn = document.getElementById('loginSubmit');
  const errorEl = document.getElementById('loginError');
  const usuario = usuarioInput ? usuarioInput.value.trim() : '';
  const senha = senhaInput ? senhaInput.value : '';

  const setFieldState = (input, state) => {
    if (!input) return;
    const wrap = input.closest('.login-v2__field');
    if (!wrap) return;
    wrap.classList.remove('error', 'ok');
    if (state) wrap.classList.add(state);
    if (state === 'error') input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };

  const setError = (msg) => {
    if (!errorEl) return;
    errorEl.textContent = msg || '';
  };

  setError('');
  setFieldState(usuarioInput, null);
  setFieldState(senhaInput, null);

  if (!usuario || !senha) {
    if (!usuario) setFieldState(usuarioInput, 'error');
    if (!senha) setFieldState(senhaInput, 'error');
    setError('Preencha matrícula e senha.');
    return;
  }

  if (submitBtn) {
    submitBtn.dataset.originalText = submitBtn.dataset.originalText || submitBtn.textContent;
    submitBtn.textContent = 'Entrando...';
    submitBtn.classList.add('is-loading');
    submitBtn.disabled = true;
  }

  fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, senha })
  })
    .then(res => res.json())
    .then(data => {
      if (!data.sucesso) {
        const motivo = data.motivo || ''; 
        const msg = motivo === 'matricula' ? 'Matrícula inválida.' : 'Senha incorreta.';
        showToastErro(msg);
        if (motivo === 'matricula') setFieldState(usuarioInput, 'error');
        else {
          setFieldState(usuarioInput, 'error');
          setFieldState(senhaInput, 'error');
        }
        setError(msg);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('is-loading');
          submitBtn.textContent = submitBtn.dataset.originalText || 'Acessar';
        }
        return;
      }
      currentUser = data.user;
      currentUser.role = normalizeRole(currentUser.role);
      applyStoredPhoto(currentUser);
      sessionStorage.setItem('usuarioLogado', JSON.stringify(currentUser));
      localStorage.removeItem('tourActive');
      localStorage.removeItem('tourType');
      localStorage.removeItem('tourStep');
      const destino = isStaffUser() ? 'admin.html' : 'dashboard.html';
      location.href = destino;
    })
    .catch(() => {
      showToastErro('Erro inesperado no login');
      setError('Erro inesperado. Tente novamente.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
        submitBtn.textContent = submitBtn.dataset.originalText || 'Acessar';
      }
    });
}

function bindLoginUX() {
  const usuarioInput = document.getElementById('usuario');
  const senhaInput = document.getElementById('senha');
  const errorEl = document.getElementById('loginError');
  if (!usuarioInput && !senhaInput) return;

  const clearState = (input) => {
    if (!input) return;
    const wrap = input.closest('.login-v2__field');
    if (wrap) wrap.classList.remove('error');
    input.removeAttribute('aria-invalid');
    if (errorEl) errorEl.textContent = '';
  };

  if (usuarioInput) {
    usuarioInput.addEventListener('input', () => clearState(usuarioInput));
  }
  if (senhaInput) {
    senhaInput.addEventListener('input', () => clearState(senhaInput));
  }
}

function logout() {
  sessionStorage.removeItem('usuarioLogado');
  sessionStorage.removeItem('tema');
  sessionStorage.removeItem('adminSessionExpired');
  window.__adminSessionExpired = false;
  location.href = 'index.html';
}

function carregarNoticias() {
  showGlobalLoading(true, 'Carregando notícias...');
  renderGridSkeleton(document.getElementById('noticiasGrid'), 3);
  renderGridSkeleton(document.getElementById('allNoticiasGrid'), 6);
  return fetch('/noticias')
    .then(res => res.json())
    .then(dados => {
      noticias = dados;
      renderNews(dados);
      atualizarDashboard();
    })
    .catch(() => {
      renderEmptyState(document.getElementById('noticiasGrid'), 'Sem notícias', 'Nenhuma notícia foi carregada.');
      renderEmptyState(document.getElementById('allNoticiasGrid'), 'Sem notícias', 'Nenhuma notícia foi carregada.');
      showToastErro('Não foi possível carregar as notícias.');
    })
    .finally(() => {
      showGlobalLoading(false);
    });
}
function carregarModalidades() {
  showGlobalLoading(true, 'Carregando modalidades...');
  renderGridSkeleton(document.getElementById('modalidadesGrid'), 3);
  renderGridSkeleton(document.getElementById('allModalidadesGrid'), 6);
  renderTableSkeleton(document.getElementById('tabelaHorarios'), 4, 4);
  renderTableSkeleton(document.getElementById('adminModalidadesTable'), 4, 5);
  return fetch('/modalidades')
    .then(res => res.json())
    .then(dados => {
      modalidades = dados.map(m => ({
        id: m.id,
        nome: m.titulo || m.nome || '',
        professor: m.professor,
        dias: m.dias || 'A definir',
        horario: m.horario || formatarHorario(m.hora_inicio, m.hora_fim),
        horaInicio: m.hora_inicio,
        horaFim: m.hora_fim,
        descricao: m.descricao,
        criadoEm: m.criado_em || m.created_at || m.data_publicacao || null,
        atualizadoEm: m.atualizado_em || m.updated_at || m.data_edicao || null
      }));
      renderModalities();
      renderScheduleTable();
      renderAdminModalidadesTable();
      applyModalidadeEditFromStorage();
      populateModalidadeSelects();
      preencherSelectSorteio();
      atualizarDashboard();
    })
    .catch(() => {
      renderEmptyState(document.getElementById('modalidadesGrid'), 'Sem modalidades', 'Nenhuma modalidade disponível no momento.');
      renderEmptyState(document.getElementById('allModalidadesGrid'), 'Sem modalidades', 'Nenhuma modalidade disponível no momento.');
      showToastErro('Não foi possível carregar as modalidades.');
    })
    .finally(() => {
      showGlobalLoading(false);
    });
}

function carregarInscricoes() {
  showGlobalLoading(true, 'Carregando inscrições...');
  let url = '/inscricoes/jics';

  if (currentUser && !isAdminUser()) {
    if (currentUser.id) {
      url = `/inscricoes/jics?aluno_id=${currentUser.id}`;
    } else if (currentUser.matricula) {
      url = `/inscricoes/jics?matricula=${encodeURIComponent(currentUser.matricula)}`;
    }
  }

  renderTableSkeleton(document.getElementById('tabelaInscricoes'), 4, 8);
  renderTableSkeleton(document.getElementById('tabelaMinhasInscricoes'), 3, 3);

  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      inscriptions = Array.isArray(data) ? data : [];
      renderModalities();
      applyInscricoesFilters();
      renderMinhasInscricoes();
      atualizarDashboard();
      preencherSelectSorteio();
    })
    .catch(() => {
      showToastErro('Não foi possível carregar as inscrições.');
      const tbody = document.getElementById('tabelaInscricoes');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8">Nenhuma inscrição disponível.</td></tr>';
      const minhas = document.getElementById('tabelaMinhasInscricoes');
      if (minhas) minhas.innerHTML = '<tr><td colspan="3">Nenhuma inscrição disponível.</td></tr>';
    })
    .finally(() => {
      showGlobalLoading(false);
    });
}

function formatarHorario(inicio, fim) {
  if (!inicio || !fim) return '-';
  const hi = inicio.slice(0, 5).replace(':', 'h');
  const hf = fim.slice(0, 5).replace(':', 'h');
  return `${hi} às ${hf}`;
}

function formatDateTimeBr(value) {
  if (!value) return '-';
  try {
    return new Date(value)
      .toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      .replace(',', ' às');
  } catch (_) {
    return '-';
  }
}

function renderModalities() {
  const grid = document.getElementById('modalidadesGrid');
  const allGrid = document.getElementById('allModalidadesGrid');
  const isDashboard = document.body?.dataset?.page === 'dashboard';
  bindDashboardModalidadeFilters();

  if (!modalidades.length) {
    renderEmptyState(grid, 'Sem modalidades', 'Nenhuma modalidade disponível no momento.');
    renderEmptyState(allGrid, 'Sem modalidades', 'Nenhuma modalidade disponível no momento.');
    return;
  }

  const normalizeInfo = (value, fallback) => {
    const parsed = normalizeDisplayText(value, '').trim();
    if (!parsed) return fallback;
    const key = normalizeLookupValue(parsed);
    if (key === 'nao informado' || key === 'não informado' || key === 'null' || key === 'undefined' || key === '-') {
      return fallback;
    }
    return parsed;
  };

  const list = modalidades.map((mod) => {
    const nome = normalizeDisplayText(mod.nome || mod.titulo || 'Modalidade');
    const meta = resolveModalidadeMeta(nome);
    const categoryLabel = meta.category === 'coletiva' ? 'Coletiva' : 'Individual';
    const professor = normalizeInfo(mod.professor, 'Professor a definir');
    const horario = normalizeInfo(mod.horario, 'Horário a definir');
    const inscritos = inscriptions.filter((item) => {
      if (item?.modalidade_id && String(item.modalidade_id) === String(mod.id)) return true;
      return normalizeLookupValue(item?.modalidade) === normalizeLookupValue(nome);
    }).length;
    const capacidadeRaw = Number(mod.limite_vagas || mod.vagas || mod.capacidade || 20);
    const capacidade = Number.isFinite(capacidadeRaw) && capacidadeRaw > 0 ? capacidadeRaw : 20;
    const abertas = inscritos < capacidade;
    const progresso = Math.min(100, Math.round((inscritos / capacidade) * 100));

    return {
      id: mod.id,
      nome,
      meta,
      categoryLabel,
      professor,
      horario,
      inscritos,
      capacidade,
      abertas,
      progresso
    };
  });

  const filteredDashboard = list.filter((mod) => {
    if (dashboardModalidadeFiltroAtivo === 'coletiva') return mod.meta.category === 'coletiva';
    if (dashboardModalidadeFiltroAtivo === 'individual') return mod.meta.category === 'individual';
    if (dashboardModalidadeFiltroAtivo === 'aberta') return mod.abertas;
    return true;
  });

  if (grid) {
    if (!filteredDashboard.length) {
      renderEmptyState(
        grid,
        'Nenhuma modalidade neste filtro',
        'Ajuste os filtros para visualizar outras opções.'
      );
    } else if (isDashboard) {
      grid.innerHTML = filteredDashboard.map((m) => `
        <article class="dashboard-modal-card" data-category="${m.meta.category}" data-status="${m.abertas ? 'open' : 'closed'}">
          <div class="dashboard-modal-cover">
            <span class="material-symbols-outlined">${m.meta.icon}</span>
            <span class="dashboard-modal-status ${m.abertas ? 'open' : 'closed'}">${m.abertas ? 'Aberto' : 'Lotado'}</span>
          </div>
          <div class="dashboard-modal-body">
            <div class="dashboard-modal-head">
              <h3 class="dashboard-modal-title">${escapeHtml(m.nome)}</h3>
              <span class="modalidade-badge ${m.meta.category}">${m.categoryLabel}</span>
            </div>
            <div class="dashboard-modal-meta">
              <span class="line">
                <span class="material-symbols-outlined">person</span>
                ${escapeHtml(m.professor)}
              </span>
              <span class="line">
                <span class="material-symbols-outlined">schedule</span>
                ${escapeHtml(m.horario)}
              </span>
            </div>
            <div class="dashboard-modal-progress">
              <small>${m.inscritos}/${m.capacidade} vagas preenchidas</small>
              <div class="bar"><span style="width: ${m.progresso}%"></span></div>
            </div>
            <div class="dashboard-modal-actions">
              <button class="btn-outline" type="button" onclick="showModalDetails('${m.id}')">Ver detalhes</button>
              ${isStaffUser() ? '' : `<button class="btn-primary" type="button" onclick="showModalDetails('${m.id}')">Inscrever-se</button>`}
            </div>
          </div>
        </article>
      `).join('');
    } else {
      grid.innerHTML = filteredDashboard.map((m) => `
        <div class="card" data-name="${escapeHtml(m.nome)}" data-category="${m.meta.category}" data-professor="${escapeHtml(m.professor)}" data-horario="${escapeHtml(m.horario)}" data-icon="${m.meta.icon}" onclick="showModalDetails('${m.id}')">
          <div class="card-header">
            <div class="card-icon modalidade-icon"><span class="material-symbols-outlined">${m.meta.icon}</span></div>
            <div>
              <div class="card-title">${escapeHtml(m.nome)}</div>
              <span class="modalidade-badge ${m.meta.category}">${m.categoryLabel}</span>
            </div>
          </div>
          <div class="card-body">
            <div class="modalidade-meta">
              <span class="material-symbols-outlined">person</span>
              <span>${escapeHtml(m.professor)}</span>
            </div>
            <div class="modalidade-meta">
              <span class="material-symbols-outlined">schedule</span>
              <span>${escapeHtml(m.horario)}</span>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  if (allGrid) {
    allGrid.innerHTML = list.map((m) => `
      <div class="card" data-name="${escapeHtml(m.nome)}" data-category="${m.meta.category}" data-professor="${escapeHtml(m.professor)}" data-horario="${escapeHtml(m.horario)}" data-icon="${m.meta.icon}" onclick="showModalDetails('${m.id}')">
        <div class="card-header">
          <div class="card-icon modalidade-icon"><span class="material-symbols-outlined">${m.meta.icon}</span></div>
          <div>
            <div class="card-title">${escapeHtml(m.nome)}</div>
            <span class="modalidade-badge ${m.meta.category}">${m.categoryLabel}</span>
          </div>
        </div>
        <div class="card-body">
          <div class="modalidade-meta">
            <span class="material-symbols-outlined">person</span>
            <span>${escapeHtml(m.professor)}</span>
          </div>
          <div class="modalidade-meta">
            <span class="material-symbols-outlined">schedule</span>
            <span>${escapeHtml(m.horario)}</span>
          </div>
        </div>
      </div>
    `).join('');
  }
}

function renderNews(lista) {
  const grid = document.getElementById('noticiasGrid');
  const allGrid = document.getElementById('allNoticiasGrid');
  if (!lista || lista.length === 0) {
    renderEmptyState(allGrid, 'Sem notícias', 'Nenhuma notícia publicada.');
    renderEmptyState(grid, 'Sem notícias', 'Nenhuma notícia publicada.');
    return;
  }
  const ordered = [...lista]
    .map((item) => ({
      ...item,
      titulo: normalizeDisplayText(item.titulo, 'Sem título'),
      descricao: normalizeDisplayText(item.descricao, 'Descrição indisponível')
    }))
    .sort((a, b) => new Date(b.data_publicacao) - new Date(a.data_publicacao));

  const htmlAll = ordered.map(n => `
    <div class="card">
      <div class="card-header">
        <div class="card-icon"><span class="material-symbols-outlined">article</span></div>
        <div class="card-title">${escapeHtml(n.titulo)}</div>
      </div>
      <div class="card-body">
        <p>${escapeHtml(truncateText(n.descricao, 220) || 'Sem resumo disponível.')}</p>
        <small>${formatDateTimeBr(n.data_publicacao)}</small>
        ${n.data_edicao ? `<small class="muted">Editado em: ${formatDateTimeBr(n.data_edicao)}</small>` : ''}
        <div class="card-actions">
          <button class="btn-view" onclick="verNoticia(${n.id})">Ver</button>
          ${isAdminUser() ? `
            <button class="btn-outline" onclick="editarNoticia(${n.id})">Editar</button>
            <button class="btn-outline" onclick="excluirNoticia(${n.id})">Excluir</button>
          ` : ''}
        </div>
      </div>
    </div>
  `).join('');

  const htmlDashboard = ordered.slice(0, 3).map(n => `
    <div class="card dashboard-news-card">
      <div class="card-header">
        <div class="card-icon"><span class="material-symbols-outlined">article</span></div>
        <div class="card-title">${escapeHtml(n.titulo)}</div>
      </div>
      <div class="card-body">
        <p>${escapeHtml(truncateText(n.descricao, 120) || 'Sem resumo disponível.')}</p>
        <small>${formatDateTimeBr(n.data_publicacao)}</small>
        <div class="card-actions">
          <button class="btn-view" onclick="verNoticia(${n.id})">Ver</button>
        </div>
      </div>
    </div>
  `).join('');

  if (allGrid) allGrid.innerHTML = htmlAll;
  if (grid) grid.innerHTML = htmlDashboard;
}

function renderScheduleTable() {
  const tbody = document.getElementById('tabelaHorarios');
  if (!tbody) return;
  if (!modalidades.length) {
    tbody.innerHTML = '<tr><td colspan="4">Nenhum horário disponível.</td></tr>';
    return;
  }
  tbody.innerHTML = modalidades.map(m => `
    <tr>
      <td>${m.nome}</td>
      <td>${m.professor}</td>
      <td>${m.dias}</td>
      <td>${m.horario}</td>
    </tr>
  `).join('');
}

function renderAdminModalidadesTable() {
  const tbody = document.getElementById('adminModalidadesTable');
  if (!tbody) return;
  if (!modalidades.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhuma modalidade cadastrada.</td></tr>';
    return;
  }
  const isAdminPage = document.body.dataset.page === 'admin';
  tbody.innerHTML = modalidades.map(m => `
    <tr>
      <td>${m.nome}</td>
      <td>${m.professor}</td>
      <td>${m.dias}</td>
      <td>${m.horario}</td>
      <td>
        <button class="btn-outline" onclick="${isAdminPage ? `editarModalidade('${m.id}')` : `openAdminModalidadeEdit('${m.id}')`}">Editar</button>
        <button class="btn-danger" onclick="excluirModalidade('${m.id}')">Excluir</button>
      </td>
    </tr>
  `).join('');
}

function openAdminModalidadeEdit(id) {
  localStorage.setItem('modalidadeEditId', id);
  openAdminTab('tabModalidades');
}

function applyModalidadeEditFromStorage() {
  if (document.body.dataset.page !== 'admin') return;
  const pending = localStorage.getItem('modalidadeEditId');
  if (!pending) return;
  switchAdminTab('tabModalidades');
  editarModalidade(pending);
  localStorage.removeItem('modalidadeEditId');
}

function editarModalidade(id) {
  const mod = modalidades.find(m => String(m.id) === String(id));
  if (!mod) return;
  modalidadeEditId = mod.id;
  const tituloEl = document.getElementById('modalidadeTitulo');
  const descricaoEl = document.getElementById('modalidadeDescricao');
  const professorEl = document.getElementById('modalidadeProfessor');
  const horaInicioEl = document.getElementById('horaInicio');
  const horaFimEl = document.getElementById('horaFim');
  if (tituloEl) tituloEl.value = mod.nome || '';
  if (descricaoEl) descricaoEl.value = mod.descricao || '';
  if (professorEl) professorEl.value = mod.professor || '';
  if (horaInicioEl && mod.horaInicio) horaInicioEl.value = mod.horaInicio;
  if (horaFimEl && mod.horaFim) horaFimEl.value = mod.horaFim;

  const diasSelecionados = (mod.dias || '').split(' e ').map(d => d.trim()).filter(Boolean);
  document.querySelectorAll('.dias-semana input').forEach((el) => {
    el.checked = diasSelecionados.includes(el.value);
  });

  const submitBtn = document.getElementById('modalidadeSubmitBtn');
  const cancelBtn = document.getElementById('modalidadeCancelBtn');
  if (submitBtn) submitBtn.textContent = 'Salvar alterações';
  if (cancelBtn) cancelBtn.classList.remove('hidden');
}

function cancelarEdicaoModalidade() {
  modalidadeEditId = null;
  const form = document.getElementById('modalidadeForm');
  if (form) form.reset();
  document.querySelectorAll('.dias-semana input').forEach((el) => { el.checked = false; });
  const submitBtn = document.getElementById('modalidadeSubmitBtn');
  const cancelBtn = document.getElementById('modalidadeCancelBtn');
  if (submitBtn) submitBtn.textContent = 'Adicionar';
  if (cancelBtn) cancelBtn.classList.add('hidden');
}

function renderMinhasInscricoes() {
  const tbody = document.getElementById('tabelaMinhasInscricoes');
  if (!tbody || !currentUser) return;
  const minhas = inscriptions.filter(i => i.matricula === currentUser.matricula);
  const vistos = new Set();
  const unicas = [];
  minhas.forEach((i) => {
    const key = `${i.modalidade}-${i.tipo}`;
    if (vistos.has(key)) return;
    vistos.add(key);
    unicas.push(i);
  });

  if (unicas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3">Você ainda não está inscrito em nenhuma modalidade.</td></tr>';
    return;
  }

  tbody.innerHTML = unicas.map(i => `
    <tr>
      <td>${i.modalidade}</td>
      <td>${i.tipo}</td>
      <td>${i.data}</td>
    </tr>
  `).join('');
}

function applyInscricoesFilters() {
  const busca = document.getElementById('filtroBuscaInscricoes');
  const term = busca ? busca.value.trim().toLowerCase() : '';

  filteredInscriptions = inscriptions.filter(i => {
    if (!term) return true;
    const haystack = [
      i.nome,
      i.matricula,
      i.turma,
      i.modalidade,
      i.sexo,
      i.tipo,
      i.data
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(term);
  });

  updateInscriptionsTable(filteredInscriptions);
}

function limparFiltrosInscricoes() {
  const busca = document.getElementById('filtroBuscaInscricoes');
  if (busca) busca.value = '';
  applyInscricoesFilters();
}

function exportarInscricoesCsv() {
  animateButton(document.getElementById('btnExportarInscricoes'));
  const rows = filteredInscriptions.length ? filteredInscriptions : inscriptions;
  if (!rows.length) {
    showToastErro('Não há inscrições para exportar.');
    return;
  }
  const header = ['Nome', 'Matricula', 'Turma', 'Modalidade', 'Sexo', 'Tipo', 'Data'];
  const csvRows = rows.map(i => [
    i.nome, i.matricula, i.turma, i.modalidade, i.sexo, i.tipo, i.data
  ]);
  const csv = buildCsvContent(csvRows, header);
  const filename = `inscricoes_${new Date().toISOString().slice(0,10)}.csv`;
  downloadTextFile(csv, filename, 'text/csv;charset=utf-8;');
}

function exportarModalidadesCsv() {
  const raw = modalidades && modalidades.length ? modalidades : (adminCache.modalidades || []);
  const normalized = raw.map(m => ({
    nome: m.nome || m.titulo || '',
    professor: m.professor || '',
    dias: m.dias || '',
    horario: m.horario || (m.hora_inicio && m.hora_fim ? formatarHorario(m.hora_inicio, m.hora_fim) : '')
  }));
  if (!normalized.length) {
    showToastErro('Não há modalidades para exportar.');
    return;
  }
  const header = ['Modalidade', 'Professor', 'Dias', 'Horario'];
  const rows = normalized.map(m => [m.nome, m.professor, m.dias, m.horario]);
  const csv = buildCsvContent(rows, header);
  const filename = `modalidades_${new Date().toISOString().slice(0,10)}.csv`;
  downloadTextFile(csv, filename, 'text/csv;charset=utf-8;');
}

function bindAdminDownloads() {
  document.querySelectorAll('.admin-download').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const type = btn.dataset.export;
      if (type === 'modalidades') {
        exportarModalidadesCsv();
      } else {
        showToastErro('Tipo de exportação não reconhecido.');
      }
    });
  });
}

function initAdminFilters() {
  const busca = document.getElementById('filtroBuscaInscricoes');
  if (busca) {
    const handler = () => applyInscricoesFilters();
    busca.addEventListener('input', handler);
    applyInscricoesFilters();
  }

  const buscaAdmin = document.getElementById('filtInscBusca');
  if (buscaAdmin && buscaAdmin.dataset.bound !== '1') {
    buscaAdmin.dataset.bound = '1';
    buscaAdmin.addEventListener('input', () => applyAdminInscricoesSearch());
  }
  if (buscaAdmin) applyAdminInscricoesSearch();
}

function loadAdminMetricsLegacy() {
  fetch('/admin/metrics')
    .then(res => res.json())
    .then(data => {
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val ?? '--');
      };
      set('metricAlunos', data.alunos);
      set('metricInscricoes', data.inscricoes);
      set('metricModalidades', data.modalidades);
      set('metricNoticias', data.noticias);
    })
    .catch(() => {
      // silencioso, evita ruído no admin
    });
}

function openMinhasInscricoes() {
  if (isAdminUser()) {
    openAdminTab('tabInscricoes');
    return;
  }
  if (isStaffUser()) {
    showToastErro('Acesso restrito.');
    return;
  }
  location.href = 'inscricoes.html';
}

function atualizarDashboard() {
  const totalModalidades = modalidades.length;
  const totalNoticias = noticias.length;
  let totalInscritos = inscriptions.length;

  if (currentUser && currentUser.role !== 'ADMIN') {
    totalInscritos = inscriptions.filter(i => i.matricula === currentUser.matricula).length;
  }

  const elModalidades = document.getElementById('totalModalidades');
  const elNoticias = document.getElementById('totalNoticias');
  const elInscritos = document.getElementById('totalInscritos');
  if (elModalidades) elModalidades.textContent = totalModalidades;
  if (elNoticias) elNoticias.textContent = totalNoticias;
  if (elInscritos) elInscritos.textContent = totalInscritos;
  renderDashboardNextGames();
}

function renderDashboardNextGames() {
  const container = document.getElementById('dashboardNextGames');
  if (!container) return;

  const base = getResultados();
  const lista = Array.isArray(base) ? base.slice(0, 4) : [];

  if (!lista.length) {
    container.innerHTML = '<p class="muted">Ainda não há jogos registrados.</p>';
    return;
  }

  container.innerHTML = lista.map((jogo) => `
    <article class="dashboard-next-item">
      <strong>${escapeHtml(jogo.equipeA || '-')} x ${escapeHtml(jogo.equipeB || '-')}</strong>
      <span>${escapeHtml(jogo.modalidade || 'Modalidade não informada')}</span>
      <small>${escapeHtml(jogo.data || 'Data a definir')}</small>
    </article>
  `).join('');
}

function showModalDetails(modalidadeId) {
  const mod = modalidades.find(m => String(m.id) === String(modalidadeId));
  if (!mod) return;
  currentInscription = mod;
  document.getElementById('detailTitle').textContent = mod.nome;
  document.getElementById('detailContent').innerHTML = `
    <strong>Professor:</strong> <p>${mod.professor}</p>
    <strong>Dias:</strong> <p>${mod.dias}</p>
    <strong>Horário:</strong> <p>${mod.horario}</p>
    <strong>Descrição:</strong> <p>${mod.descricao}</p>
  `;
  const confirmarBtn = document.querySelector('#detailModal .btn-primary');
  if (confirmarBtn) confirmarBtn.style.display = isStaffUser() ? 'none' : '';
  openModal('detailModal');
}

function confirmInscription() {
  if (!currentUser || !currentInscription) return;
  if (isStaffUser()) {
    showToastErro('Administradores e professores não podem se inscrever.');
    return;
  }
  subscribeToJICS(currentInscription.id);
}

function subscribeToJICS(modalidadeId) {
  if (isStaffUser()) {
    showToastErro('Administradores e professores não podem se inscrever.');
    return;
  }
  fetch('/inscricoes/jics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aluno_id: currentUser.id, modalidade_id: modalidadeId })
  })
    .then(res => res.json())
    .then(data => {
      if (!data.sucesso) {
        mostrarToastAtencao(data.mensagem || 'Não foi possível inscrever');
        return;
      }
      showToastSucesso('Inscrição realizada com sucesso!');
      closeModal('detailModal');
      carregarInscricoes();
    })
    .catch(() => showToastErro('Erro ao realizar inscrição'));
}

function resolveModalidadeIdByName(nome) {
  const label = String(nome || '').trim().toLowerCase();
  if (!label) return null;
  const mod = modalidades.find(m => String(m.nome || '').trim().toLowerCase() === label);
  return mod ? mod.id : null;
}

function cancelarInscricao(inscricaoIdEnc, matriculaEnc, modalidadeIdEnc, modalidadeEnc) {
  if (!currentUser) {
    showToastErro('Usuário não identificado.');
    return;
  }
  const inscricaoId = decodeURIComponent(inscricaoIdEnc || '').trim();
  const matricula = decodeURIComponent(matriculaEnc || '').trim();
  const modalidadeLabel = decodeURIComponent(modalidadeEnc || '').trim();
  let modalidadeId = decodeURIComponent(modalidadeIdEnc || '').trim();
  if (!modalidadeId) {
    const resolved = resolveModalidadeIdByName(modalidadeLabel);
    if (resolved) modalidadeId = resolved;
  }
  if (!inscricaoId && !modalidadeId && !modalidadeLabel) {
    showToastErro('Não foi possível identificar a inscrição.');
    return;
  }

  openDangerConfirm({
    title: 'Cancelar inscrição',
    message: `Tem certeza que deseja cancelar a inscrição${modalidadeLabel ? ` em ${modalidadeLabel}` : ''}?`,
    onConfirm: () => {
      const payload = {};
      if (inscricaoId) payload.inscricao_id = inscricaoId;
      if (modalidadeId) payload.modalidade_id = modalidadeId;
      if (!modalidadeId && modalidadeLabel) payload.modalidade_nome = modalidadeLabel;
      if (currentUser.id) payload.aluno_id = currentUser.id;
      else if (matricula) payload.matricula = matricula;

      fetch('/inscricoes/jics/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(async res => {
          let data = null;
          try { data = await res.json(); } catch (_) { data = null; }
          if (res.ok && data && data.sucesso) {
            showToastSucesso('Inscrição cancelada.');
            carregarInscricoes();
          } else {
            showToastErro(data?.mensagem || 'Não foi possível cancelar.');
          }
        })
        .catch(() => showToastErro('Erro ao cancelar inscrição.'));
    }
  });
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.add('hidden');
  });
}

function openModal(id) {
  closeAllModals();
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}

let dangerConfirmAction = null;

function openDangerConfirm({ title, message, onConfirm }) {
  const modal = document.getElementById('modalDangerConfirm');
  if (!modal) return;
  const titleEl = document.getElementById('dangerConfirmTitle');
  const textEl = document.getElementById('dangerConfirmText');
  const btnEl = document.getElementById('dangerConfirmBtn');

  dangerConfirmAction = onConfirm || null;
  if (titleEl) titleEl.textContent = title || 'Confirmar ação';
  if (textEl) textEl.textContent = message || 'Tem certeza que deseja continuar?';
  if (btnEl) btnEl.disabled = false;
  modal.classList.remove('hidden');
}

function closeDangerConfirm() {
  const modal = document.getElementById('modalDangerConfirm');
  if (modal) modal.classList.add('hidden');
  dangerConfirmAction = null;
}

function confirmDangerAction() {
  if (typeof dangerConfirmAction === 'function') dangerConfirmAction();
  closeDangerConfirm();
}

function requestDangerConfirm({ title, message, onConfirm }) {
  if (typeof openDangerConfirm === 'function') {
    openDangerConfirm({ title, message, onConfirm });
    return;
  }
  if (typeof onConfirm === 'function') onConfirm();
}

function cancelModEdit() {
  modalidadeEditId = null;
  const nomeInput = document.getElementById('modNome');
  const horarioInput = document.getElementById('modHorario');
  const saveBtn = document.getElementById('modSaveBtn');
  const cancelBtn = document.getElementById('modCancelBtn');
  if (nomeInput) nomeInput.value = '';
  if (horarioInput) horarioInput.value = '';
  if (saveBtn) saveBtn.textContent = 'Salvar modalidade';
  if (cancelBtn) cancelBtn.classList.add('hidden');
}

// ------------------ BUSCAR ALUNO (admin) ------------------
async function buscarAlunoAdmin() {
  const matricula = document.getElementById('buscaMatricula')?.value.trim();
  const box = document.getElementById('buscaResultado');
  if (!box) return;
  if (!matricula) {
    box.innerHTML = '<p class="muted">Informe a matrícula.</p>';
    return;
  }
  try {
    const res = await fetch(`/admin/aluno/${encodeURIComponent(matricula)}`);
    if (!res.ok) throw new Error(res.status);
    const a = await res.json();
    box.innerHTML = `
      <table class="busca-aluno-table" aria-label="Dados do aluno">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Matrícula</th>
            <th>Turma</th>
            <th>Campus</th>
            <th>Sexo</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${a.nome || '-'}</td>
            <td>${a.matricula || '-'}</td>
            <td>${a.turma || '-'}</td>
            <td>${a.campus || '-'}</td>
            <td>${a.sexo || '-'}</td>
            <td>${a.email_pessoal || a.email_academico || '-'}</td>
          </tr>
        </tbody>
      </table>
    `;
  } catch (e) {
    box.innerHTML = '<p class="muted">Aluno não encontrado.</p>';
  }
}

function buscarAluno() {
  return buscarAlunoAdmin();
}

// ------------------ SORTEIO: carregar/horários ------------------
async function carregarTabelaSorteio() {
  const mod = document.getElementById('sorteioModalidade')?.value;
  const sexo = document.getElementById('sorteioSexo')?.value;
  const chave = document.getElementById('sorteioChave')?.value;
  if (!mod || !sexo) {
    renderTableBody('sorteioBody', [], ()=>' ', 9);
    return;
  }
  renderSkeletonTable('sorteioBody', 6, 9);
  const params = new URLSearchParams({ modalidade: mod, sexo });
  if (chave) params.append('chave', chave);
  const data = await adminFetch('/admin/jogos?' + params.toString(), []);
  adminCache.jogos = data;
  sorteioRows = data.map(j => ({ ...j, equipeA: j.equipeA||j.equipe_a, equipeB: j.equipeB||j.equipe_b, hora: j.hora||j.hora_oficial }));
  preencherSelectsAdmin();
  renderSorteioTabela();
}

function renderSorteioTabela() {
  const tbody = document.getElementById('sorteioBody');
  if (!tbody) return;
  if (!sorteioRows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Escolha filtros e clique em "Gerar tabela".</td></tr>';
    return;
  }
  tbody.innerHTML = sorteioRows.map((j, idx)=>`
    <tr>
      <td>${j.ordem ?? '-'}</td>
      <td>${j.jogo || j.numero_jogo || '-'}</td>
      <td>${j.hora || 'A seguir'}</td>
      <td>${j.chave || '-'}</td>
      <td>${j.equipeA || '-'}</td>
      <td class="placar">X</td>
      <td>${j.equipeB || '-'}</td>
      <td>${renderStatusPill(j.status || 'NAO_INICIADO')}</td>
      <td><button class="btn-outline btn-sm" onclick="preencherSumulaFromSorteio(${idx})">Súmula</button></td>
    </tr>
  `).join('');
}

function limparSorteio() {
  ['sorteioModalidade','sorteioSexo','sorteioChave','sorteioLocal','sorteioModo','sorteioHoraInicio','sorteioIntervalo'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  sorteioRows=[]; adminCache.jogos=[];
  renderSorteioTabela();
}

function exportarTabelaSorteioPrint(){ window.print(); }

// ------------------ SUMULA ------------------
async function salvarSumulaResultado() {
  const jogoLabel = document.getElementById('sumulaJogo')?.value;
  const placarA = document.getElementById('sumulaPlacarA')?.value || 0;
  const placarB = document.getElementById('sumulaPlacarB')?.value || 0;
  if (!jogoLabel) { showToast('Selecione o jogo', 'error'); return; }
  const jogo = adminCache.jogos.find(j => (j.jogo || j.numero_jogo) === jogoLabel);
  if (!jogo) { showToast('Jogo não encontrado', 'error'); return; }
  try {
    const res = await fetch(`/sumulas/jogos/${jogo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        placar_a: placarA,
        placar_b: placarB,
        wo: false,
        observacoes: ''
      })
    });
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.message || 'Erro');
    showToast('Súmula salva','info');
  } catch(e){ showToast('Erro ao salvar sumula','error'); }
}

function getSumulaFormData() {
  return {
    id: Date.now(),
    modalidade: document.getElementById('sumulaModalidade')?.value || '',
    fase: document.getElementById('sumulaFase')?.value || '',
    sexo: document.getElementById('sumulaSexo')?.value || '',
    etapa: document.getElementById('sumulaEtapa')?.value || '',
    data: document.getElementById('sumulaData')?.value || '',
    arbitro: document.getElementById('sumulaArbitro')?.value || '',
    equipeA: document.getElementById('sumulaEquipeA')?.value || '',
    pontosA: Number(document.getElementById('sumulaPontosA')?.value || 0),
    equipeB: document.getElementById('sumulaEquipeB')?.value || '',
    pontosB: Number(document.getElementById('sumulaPontosB')?.value || 0),
    cartoes: document.getElementById('sumulaCartoes')?.value || '',
    mesarios: document.getElementById('sumulaMesarios')?.value || '',
    inicio: document.getElementById('sumulaHorarioInicio')?.value || '',
    fim: document.getElementById('sumulaHorarioFim')?.value || ''
  };
}

function gerarSumulaPreview(download = false) {
  const d = getSumulaFormData();
  if (!d.modalidade || !d.equipeA || !d.equipeB || !d.fase) {
    showToastErro('Preencha modalidade, fase e as duas equipes antes de gerar a previa.');
    return;
  }
  const titulo = `Súmula - ${d.equipeA} x ${d.equipeB}`;
  const html = `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>${titulo}</title>
    <style>
      body { font-family: 'Courier New', monospace; padding: 24px; color:#000; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
      td { border: 1px solid #000; padding: 6px; vertical-align: top; }
      h3 { text-align: center; margin: 12px 0; }
    </style>
    </head><body>
      <h3>${titulo}</h3>
      <table>
        <tr><td colspan="2"><strong>Identificação do jogo</strong></td></tr>
        <tr><td>Modalidade: ${d.modalidade}</td><td>Fase: ${d.fase}</td></tr>
        <tr><td>Sexo: ${d.sexo}</td><td>Etapa: ${d.etapa}</td></tr>
        <tr><td>Data: ${d.data}</td><td>Inicio: ${d.inicio}  /  Fim: ${d.fim}</td></tr>
        <tr><td>Árbitro: ${d.arbitro}</td><td>Mesários: ${d.mesarios}</td></tr>
      </table>
      <table>
        <tr><td colspan="4"><strong>Placar</strong></td></tr>
        <tr><td>Equipe A</td><td>${d.equipeA}</td><td>Equipe B</td><td>${d.equipeB}</td></tr>
        <tr><td colspan="2">Pontos A: ${d.pontosA}</td><td colspan="2">Pontos B: ${d.pontosB}</td></tr>
      </table>
      <table>
        <tr><td><strong>Cartões</strong></td></tr>
        <tr><td>${d.cartoes || '-'}</td></tr>
      </table>
    </body></html>
  `;

  if (download) {
    const aName = sanitizeFilename(d.equipeA, 'equipeA');
    const bName = sanitizeFilename(d.equipeB, 'equipeB');
    const filename = `sumula_${aName}_vs_${bName}.html`;
    downloadTextFile(html, filename, 'text/html;charset=utf-8;');
  } else {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    } else {
      showToastErro('Popup bloqueado. Permita popups para ver a prévia.');
    }
  }
}

function preencherSumulaFromSorteio(idx = 0) {
  if (!sorteioRows.length) {
    showToastErro('Gere a tabela de sorteio primeiro.');
    return;
  }
  const jogo = sorteioRows[idx] || sorteioRows[0];
  if (!jogo) return;
  const modalSel = document.getElementById('sorteioModalidade');
  const sexoSel = document.getElementById('sorteioSexo');
  const sumMod = document.getElementById('sumulaModalidade');
  const sumSexo = document.getElementById('sumulaSexo');
  if (sumMod && modalSel) sumMod.value = modalSel.value || '';
  if (sumSexo && sexoSel) {
    const val = sexoSel.value === 'M' ? 'Masculino' : sexoSel.value === 'F' ? 'Feminino' : '';
    sumSexo.value = val;
  }
  const equipeA = document.getElementById('sumulaEquipeA');
  const equipeB = document.getElementById('sumulaEquipeB');
  if (equipeA) equipeA.value = jogo.equipeA || '';
  if (equipeB) equipeB.value = jogo.equipeB || '';
  const fase = document.getElementById('sumulaFase');
  if (fase) fase.value = jogo.jogo || 'Classificatória';
  const data = document.getElementById('sumulaData');
  if (data && !data.value) data.valueAsDate = new Date();
  document.getElementById('tabSumula')?.scrollIntoView({ behavior: 'smooth' });
}

function renderResultadosLista() {
  const container = document.getElementById('listaResultados') || document.getElementById('resultadosLista');
  if (!container) return;
  const lista = filtrarLista(getResultados());
  if (lista.length === 0) {
    container.innerHTML = '<p class="muted">Nenhum resultado registrado.</p>';
    return;
  }
  container.innerHTML = lista.map(r => `
    <div class="result-card">
      <strong>${r.modalidade} - ${r.fase} (${r.sexo})</strong>
      <span>${r.equipeA} ${r.pontosA} x ${r.pontosB} ${r.equipeB}</span>
      <small>Etapa: ${r.etapa} Data: ${r.data || '-'} Árbitro: ${r.arbitro || '-'}</small>
    </div>
  `).join('');
}

function filtrarLista(lista) {
  const busca = (document.getElementById('filtroBusca')?.value || '').toLowerCase();
  const modalidade = document.getElementById('filtroModalidade')?.value || '';
  const fase = document.getElementById('filtroFase')?.value || '';
  const sexo = document.getElementById('filtroSexo')?.value || '';
  const etapa = document.getElementById('filtroEtapa')?.value || '';

  return lista.filter(r => {
    const texto = `${r.modalidade} ${r.equipeA} ${r.equipeB}`.toLowerCase();
    if (busca && !texto.includes(busca)) return false;
    if (modalidade && r.modalidade !== modalidade) return false;
    if (fase && r.fase !== fase) return false;
    if (sexo && r.sexo !== sexo) return false;
    if (etapa && r.etapa !== etapa) return false;
    return true;
  });
}

function filtrarResultados() {
  renderResultadosLista();
}

function baixarResultados() {
  const lista = filtrarLista(getResultados());
  if (lista.length === 0) {
    showToastErro('Não há resultados para exportar.');
    return;
  }
  const header = ['Modalidade', 'Fase', 'Sexo', 'Etapa', 'Equipe A', 'Pontos A', 'Equipe B', 'Pontos B', 'Data', 'Árbitro'];
  const rows = lista.map(r => [r.modalidade, r.fase, r.sexo, r.etapa, r.equipeA, r.pontosA, r.equipeB, r.pontosB, r.data, r.arbitro]);
  const csv = buildCsvContent(rows, header);
  const filename = `resultados_${new Date().toISOString().slice(0,10)}.csv`;
  downloadTextFile(csv, filename, 'text/csv;charset=utf-8;');
}

function renderClassification() {
  const container = document.getElementById('classificationTable');
  if (!container) return;
  const lista = getResultados();
  const pontos = {};
  lista.forEach(r => {
    const keyA = r.equipeA;
    const keyB = r.equipeB;
    if (!pontos[keyA]) pontos[keyA] = 0;
    if (!pontos[keyB]) pontos[keyB] = 0;
    if (r.pontosA > r.pontosB) {
      pontos[keyA] += 3;
    } else if (r.pontosA < r.pontosB) {
      pontos[keyB] += 3;
    } else {
      pontos[keyA] += 1;
      pontos[keyB] += 1;
    }
  });
  const ranking = Object.entries(pontos).sort((a, b) => b[1] - a[1]);
  container.innerHTML = ranking.length
    ? ranking.map(([equipe, pts], idx) => `<div class="result-card">${idx + 1}. ${equipe} - ${pts} pts</div>`).join('')
    : '<p class="muted">Nenhuma pontuação registrada.</p>';
}

function initSumula() {
  populateModalidadeSelects();
  renderResultadosLista();
  renderClassification();
  if (typeof QRCode !== 'undefined') {
    const qr = document.getElementById('qrCode');
    if (qr && qr.childNodes.length === 0) {
      new QRCode(qr, { text: `${location.origin}/sumula-mobile.html`, width: 160, height: 160 });
    }
  }
}

function startTour(type) {
  if (!tourSteps[type]) return;
  localStorage.setItem('tourActive', '1');
  localStorage.setItem('tourType', type);
  localStorage.setItem('tourStep', '0');
  runTourStep();
}

function runTourStep() {
  const active = localStorage.getItem('tourActive');
  const type = localStorage.getItem('tourType');
  const step = Number(localStorage.getItem('tourStep')) || 0;
  if (!active || !type || !tourSteps[type]) return;

  const steps = tourSteps[type];
  const current = steps[step];
  if (!current) {
    endTour(true);
    return;
  }

  if (current.page && !location.href.includes(current.page)) {
    location.href = current.page;
    return;
  }

  const target = document.querySelector(current.selector);
  if (!target) return;

  const overlay = document.getElementById('tourOverlay');
  const highlight = document.getElementById('tourHighlight');
  const tooltip = document.getElementById('tourTooltip');
  if (!overlay || !highlight || !tooltip) return;

  overlay.classList.remove('hidden');
  const rect = target.getBoundingClientRect();
  highlight.style.top = `${rect.top + window.scrollY - 6}px`;
  highlight.style.left = `${rect.left + window.scrollX - 6}px`;
  highlight.style.width = `${rect.width + 12}px`;
  highlight.style.height = `${rect.height + 12}px`;

  document.getElementById('tourTitle').textContent = current.title;
  document.getElementById('tourText').textContent = current.text;

  tooltip.style.top = `${rect.bottom + window.scrollY + 12}px`;
  tooltip.style.left = `${rect.left + window.scrollX}px`;
}

function nextTourStep() {
  const step = Number(localStorage.getItem('tourStep')) || 0;
  localStorage.setItem('tourStep', String(step + 1));
  runTourStep();
}

function prevTourStep() {
  const step = Number(localStorage.getItem('tourStep')) || 0;
  localStorage.setItem('tourStep', String(Math.max(step - 1, 0)));
  runTourStep();
}

function endTour(finished) {
  localStorage.removeItem('tourActive');
  localStorage.removeItem('tourType');
  localStorage.removeItem('tourStep');
  const overlay = document.getElementById('tourOverlay');
  if (overlay) overlay.classList.add('hidden');
  if (finished) location.href = 'dashboard.html';
}

function checkTour() {
  if (localStorage.getItem('tourActive')) runTourStep();
}

function initPage() {
  loadUserFromStorage();
  initTheme();
  bindPhoneMasks();
  normalizeInteractiveElements();
  scheduleResponsiveTableCards();
  if (!window.__phoneMaskObserver) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches('input')) {
            bindPhoneMaskInput(node);
          } else {
            bindPhoneMasks(node);
          }
          normalizeInteractiveElements(node);
          scheduleResponsiveTableCards();
        });
      });
      enhanceSideNavIcons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__phoneMaskObserver = observer;
  }
  const page = document.body.dataset.page || '';
  const publicPages = ['login', 'termos', 'privacidade', 'suporte', 'solicitar-otp', 'validar-otp', 'redefinir-senha', 'recuperar-matricula', 'gov-callback'];
  const isPublicPage = !page || publicPages.includes(page);

  if (currentUser) {
    currentUser.role = normalizeRole(currentUser.role);
    sessionStorage.setItem('usuarioLogado', JSON.stringify(currentUser));
  }

  if (isPublicPage) {
    setNavbarGuest();
    ensureSiteFooter();
    if (page === 'login') bindLoginUX();
    return;
  }

  if (!currentUser) {
    location.href = 'index.html';
    return;
  }

  ensureV0ShellScaffold(page);
  document.body.classList.toggle('v0-responsive-shell', shouldUseV0ResponsiveShell(page));
  renderDrawer();
  ensureSideNavLinks();
  enhanceSideNavIcons();
  bindDrawerOverlays();
  bindDrawerGestures();
  bindEdgeSwipeOpen();
  attachDrawerShortcuts();
  syncResponsiveLayoutMode();
  renderMobileBottomNav(page);
  applyRoleVisibility();
  applyHeroGreeting();
  ensureUserFromApi().then(applyHeroGreeting);
  const avatar = document.getElementById('userAvatar');
  if (avatar) avatar.src = currentUser.foto || '/assets/avatar-default.png';

  if (page === 'admin' && sessionStorage.getItem('adminSessionExpired') === '1') {
    handleAdminSessionExpired('Sessão expirada. Faça login novamente.');
    return;
  }

  if ((page === 'sumula' || page === 'sumula-mobile') && !isAdminUser()) {
    location.href = 'dashboard.html';
    return;
  }

  if ((page === 'admin' || page === 'admin-cadastro') && !isStaffUser()) {
    location.href = 'dashboard.html';
    return;
  }

  carregarNoticias();
  carregarModalidades();
  carregarInscricoes();

  if (page === 'perfil') carregarPerfil();
  if (page === 'sumula' || page === 'sumula-mobile') initSumula();
  if (page === 'resultados') renderResultadosLista();
  if (page === 'admin' || page === 'admin-cadastro') {
    initSidebarCollapse();
  }
  if (page === 'admin') {
    applyAdminTabVisibility();
    const pendingTab = localStorage.getItem('adminTab');
    if (pendingTab) {
      switchAdminTab(pendingTab);
      localStorage.removeItem('adminTab');
    }
    initAdminFilters();
    preencherSelectSorteio();
    loadAdminMetrics();
  }

  ensureSiteFooter();
  bindAdminDownloads();
  checkTour();
  scheduleResponsiveTableCards();

  window.addEventListener('resize', () => {
    ensureV0ShellScaffold(page);
    document.body.classList.toggle('v0-responsive-shell', shouldUseV0ResponsiveShell(page));
    syncResponsiveLayoutMode();
    enhanceSideNavIcons();
    renderMobileBottomNav(page);
    if (localStorage.getItem('tourActive')) runTourStep();
    scheduleResponsiveTableCards();
  });
  window.addEventListener('scroll', () => {
    if (localStorage.getItem('tourActive')) runTourStep();
  }, { passive: true });
}

function carregarPerfil() {
  if (!currentUser) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '-'; };
  set('perfilNome', currentUser.nome);
  set('perfilMatricula', currentUser.matricula);
  set('perfilCurso', currentUser.descricao_curso);
  set('perfilTurma', currentUser.turma);
  set('perfilCampus', currentUser.campus);
  set('perfilNascimento', currentUser.data_nascimento ? new Date(currentUser.data_nascimento).toLocaleDateString('pt-BR') : '-');
  set('perfilTelefone', currentUser.telefone);
  set('perfilEmailAcademico', currentUser.email_academico);
  set('perfilEmailPessoal', currentUser.email_pessoal);
}

function updateInscriptionsTable(list) {
  const tbody = document.getElementById('tabelaInscricoes');
  const empty = document.getElementById('inscricoesEmpty');
  if (!tbody) return;
  const source = Array.isArray(list) ? list : inscriptions;
  if (!source.length) {
    tbody.innerHTML = '<tr><td colspan="8">Nenhuma inscrição encontrada.</td></tr>';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  tbody.innerHTML = source.map(i => `
    <tr>
      <td>${i.nome}</td>
      <td>${i.matricula}</td>
      <td>${i.turma}</td>
      <td>${i.modalidade}</td>
      <td>${i.sexo}</td>
      <td>${i.tipo}</td>
      <td>${i.data}</td>
      <td class="td-actions">
        <button class="btn-danger btn-sm" onclick="cancelarInscricao('${encodeURIComponent(String(i.inscricao_id || ''))}','${encodeURIComponent(String(i.matricula || ''))}','${encodeURIComponent(String(i.modalidade_id || ''))}','${encodeURIComponent(String(i.modalidade || ''))}')">Cancelar</button>
      </td>
    </tr>
  `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSharedModals();
  await ensurePasswordUx();
  initPasswordUxModal();
  setupPasswordRecoveryModal();
  initPage();
  attachPasswordRecoveryLinks();
});

/* ====== Sorteio (admin) ====== */
function calcularQtdChaves(total) {
  if (total <= 6) return 1;
  if (total <= 12) return 2;
  if (total <= 18) return 3;
  return 4;
}

function distribuirEmChaves(equipes, qtdChaves) {
  const grupos = Array.from({ length: qtdChaves }, () => []);
  const emb = embaralhar(equipes);
  emb.forEach((eq, i) => grupos[i % qtdChaves].push(eq));
  return grupos;
}

function gerarRoundRobin(grupo) {
  const jogos = [];
  for (let i = 0; i < grupo.length; i++) {
    for (let j = i + 1; j < grupo.length; j++) {
      jogos.push({ equipeA: grupo[i], equipeB: grupo[j] });
    }
  }
  return jogos;
}

function gerarRoundRobinTurmas(equipes) {
  const total = equipes.length;
  const chavesN = calcularQtdChaves(total);
  const chavesLabels = ['CH A','CH B','CH C','CH D'].slice(0, chavesN);
  const grupos = distribuirEmChaves(equipes, chavesN);

  const jogos = [];
  grupos.forEach((grupo, gi) => {
    const chave = chavesLabels[gi];
    const rr = gerarRoundRobin(grupo);
    rr.forEach(item => jogos.push({ fase: 'GRUPOS', chave, equipeA: item.equipeA, equipeB: item.equipeB }));
  });
  return jogos;
}

function aplicarNumeracaoEHorarios(jogos, horaInicio = '07:30', intervaloMin = 0) {
  let [h, m] = horaInicio.split(':').map(Number);
  jogos.forEach((j, idx) => {
    j.ordem = idx + 1;
    j.numero_jogo = idx + 1;
    if (intervaloMin > 0) {
      const totalMin = h * 60 + m + idx * intervaloMin;
      const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
      const mm = String(totalMin % 60).padStart(2, '0');
      j.hora = `${hh}:${mm}`;
    } else {
      j.hora = idx === 0 ? '7h30' : 'A seguir';
    }
  });
  return jogos;
}

function preencherSelectSorteio() {
  const selMod = document.getElementById('sorteioModalidade');
  if (!selMod) return;
  const valores = modalidades.length
    ? modalidades.map(m => m.nome)
    : inscriptions.map(i => i.modalidade).filter(Boolean);
  setSelectOptions(selMod, valores, 'Modalidade');
}

async function carregarEquipesTurmas(modId, sexo) {
  let base = inscriptions;
  if (modId) {
    const modName = resolveModalidadeNome(modId);
    base = base.filter(i => String(i.modalidade_id) === String(modId) || i.modalidade === modName);
  }
  if (sexo) base = base.filter(i => String(i.sexo || '').toUpperCase() === sexo.toUpperCase());
  const equipes = Array.from(new Set(base.map(i => i.turma || '').filter(Boolean)));
  return equipes;
}

async function gerarTabelaSorteio() {
  const modNome = document.getElementById('sorteioModalidade')?.value || '';
  const sexo = document.getElementById('sorteioSexo')?.value || '';
  const horaInicio = document.getElementById('sorteioHoraInicio')?.value || '07:30';
  const intervaloMin = Number(document.getElementById('sorteioIntervalo')?.value || 0);

  if (!modNome || !sexo) { showToastErro('Escolha modalidade e sexo'); return; }

  const equipes = await carregarEquipesTurmas(modNome, sexo);
  if (!equipes.length) { showToastErro('Sem turmas inscritas'); return; }

  let jogosBase = gerarRoundRobinTurmas(equipes);
  jogosBase = aplicarNumeracaoEHorarios(jogosBase, horaInicio, intervaloMin).map((j, idx) => ({
    ...j,
    jogo: j.jogo || `Jogo ${j.ordem || idx + 1}`
  }));

  const payloadJogos = jogosBase.map((j, idx) => ({
    chave: j.chave || null,
    jogo: j.jogo || `Jogo ${j.ordem || idx + 1}`,
    ordem: j.ordem || idx + 1,
    hora: j.hora || null,
    equipeA: j.equipeA,
    equipeB: j.equipeB
  }));

  try {
    const res = await adminPost('/admin/sorteio/jogos', {
      modalidade: modNome,
      sexo,
      chave: '',
      jogos: payloadJogos
    });
    sorteioRows = (res?.jogos || payloadJogos).map(j => ({
      ...j,
      equipeA: j.equipeA || j.equipe_a,
      equipeB: j.equipeB || j.equipe_b,
      hora: j.hora || j.hora_oficial
    }));
    adminCache.jogos = sorteioRows;
    renderSorteioTabela();
    showToastSucesso('Tabela gerada e salva.');
  } catch (e) {
    showToastErro('Erro ao gerar tabela.');
  }
}

async function gerarHorariosSorteio() {
  const horaInicio = document.getElementById('sorteioHoraInicio')?.value || '07:30';
  const intervaloMin = Number(document.getElementById('sorteioIntervalo')?.value || 0);
  if (!sorteioRows.length) { showToastErro('Gere a tabela antes de aplicar horários'); return; }

  aplicarNumeracaoEHorarios(sorteioRows, horaInicio, intervaloMin);

  const modNome = document.getElementById('sorteioModalidade')?.value || '';
  const sexo = document.getElementById('sorteioSexo')?.value || '';

  const payloadJogos = sorteioRows.map((j, idx) => ({
    chave: j.chave || null,
    jogo: j.jogo || j.jogo_label || `Jogo ${j.ordem || idx + 1}`,
    ordem: j.ordem || idx + 1,
    hora: j.hora || null,
    equipeA: j.equipeA || j.equipe_a,
    equipeB: j.equipeB || j.equipe_b
  }));

  try {
    const res = await adminPost('/admin/sorteio/jogos', {
      modalidade: modNome,
      sexo,
      chave: '',
      jogos: payloadJogos
    });
    sorteioRows = (res?.jogos || payloadJogos).map(j => ({
      ...j,
      equipeA: j.equipeA || j.equipe_a,
      equipeB: j.equipeB || j.equipe_b,
      hora: j.hora || j.hora_oficial
    }));
    adminCache.jogos = sorteioRows;
    renderSorteioTabela();
    showToastSucesso('Horários aplicados e salvos.');
  } catch (e) {
    showToastErro('Erro ao aplicar horários.');
  }
}

function aplicarHorariosSorteio() {
  return gerarHorariosSorteio();
}

async function carregarTabelaSorteioCompat() {
  const modNome = document.getElementById('sorteioModalidade')?.value || '';
  const sexo = document.getElementById('sorteioSexo')?.value || '';
  const chave = document.getElementById('sorteioChave')?.value || '';
  if (!modNome || !sexo) {
    renderSorteioTabela();
    return;
  }
  renderSkeletonTable('sorteioBody', 6, 9);
  const params = new URLSearchParams({ modalidade: modNome, sexo });
  if (chave) params.append('chave', chave);
  const data = await adminFetch('/admin/jogos?' + params.toString(), []);
  adminCache.jogos = data;
  sorteioRows = (data || []).map(j => ({
    ...j,
    equipeA: j.equipeA || j.equipe_a,
    equipeB: j.equipeB || j.equipe_b,
    hora: j.hora || j.hora_oficial
  }));
  renderSorteioTabela();
}

function renderTabelaSorteio() {
  renderSorteioTabela();
}

function limparSorteioCompat() {
  ['sorteioModalidade','sorteioSexo','sorteioChave','sorteioLocal','sorteioModo','sorteioHoraInicio','sorteioIntervalo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const tbody = document.getElementById('sorteioBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="muted center">Escolha filtros e clique em "Gerar tabela".</td></tr>';
  sorteioRows = [];
}

function animateButton(btn) {
  if (!btn) return;
  btn.classList.add('btn-pulse');
  setTimeout(() => btn.classList.remove('btn-pulse'), 700);
}

function exportarTabelaSorteioPrintLegacy() {
  window.print();
}








