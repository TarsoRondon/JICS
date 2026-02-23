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

    addLink('inscricoes.html', 'Minhas inscricoes', 'user-only');
    addLink('admin.html', 'Administracao', 'staff-only');

    sideNav.querySelectorAll('.side-link').forEach((link) => {
        const href = link.getAttribute('href') || '';
        if (href.includes('inscricoes.html') || href.includes('modalidades.html')) {
            link.classList.add('user-only');
        }
        if (href.includes('admin.html')) {
            link.classList.add('staff-only');
        }
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
            link.textContent = 'Administracao';
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
        { selector: '.nav-hamburger', title: 'Menu rÃ¡pido', text: 'Use o menu lateral para navegar pelas pÃ¡ginas.' },
        { selector: '.hero-actions .btn-primary', title: 'InscriÃ§Ã£o', text: 'Clique aqui para ir para a pÃ¡gina de modalidades.', page: 'modalidades.html' },
        { selector: '#allModalidadesGrid', title: 'Modalidades', text: 'Escolha uma modalidade e confirme a inscriÃ§Ã£o.' },
    ],
    senha: [
        { selector: '.user-trigger', title: 'Menu do usuÃ¡rio', text: 'Clique no avatar para abrir o menu.' },
        { selector: '.drawer-btn', title: 'Perfil', text: 'Acesse o perfil para alterar a senha.', page: 'perfil.html' },
        { selector: '.profile-card .btn-primary', title: 'Alterar senha', text: 'Clique para abrir o modal de troca de senha.' },
    ],
    foto: [
        { selector: '.user-trigger', title: 'Menu do usuÃ¡rio', text: 'Abra o menu lateral do usuÃ¡rio.' },
        { selector: '.drawer-sub-btn', title: 'Alterar foto', text: 'Clique em "Alterar foto" para abrir o modal.' },
        { selector: '#photoInput', title: 'PrÃ©via', text: 'Envie a foto e ajuste com zoom e posiÃ§Ã£o.' },
    ],
    resultados: [
        { selector: '.drawer-btn', title: 'Resultados', text: 'Acesse a pÃ¡gina de resultados pelo menu.', page: 'resultados.html' },
        { selector: '.filter-bar', title: 'Filtros', text: 'Use filtros e busca para localizar partidas.' },
        { selector: '.btn-outline', title: 'Baixar CSV', text: 'Clique aqui para baixar os resultados.' },
    ],
    completo: [
        { selector: '.navbar-brand', title: 'Topo rÃ¡pido', text: 'Clique no IFRO ESPORTES para voltar ao topo.' },
        { selector: '.hero-actions .btn-primary', title: 'InscriÃ§Ãµes', text: 'Comece pelas modalidades.', page: 'modalidades.html' },
        { selector: '.cards-grid', title: 'Modalidades', text: 'Confira as modalidades disponÃ­veis.' },
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
        // silencioso para nÃ£o quebrar UX se offline
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
    const overlay = document.getElementById('sideOverlay');
    if (!nav || !overlay) return;
    nav.classList.toggle('open');
    overlay.classList.toggle('active');
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
    const overlay = document.getElementById('drawerOverlay');
    if (!drawer || !overlay) return;
    drawer.classList.toggle('open');
    overlay.classList.toggle('active');
}

function bindDrawerOverlays() {
    const sideOverlay = document.getElementById('sideOverlay');
    const sideNav = document.getElementById('sideNav');
    if (sideOverlay && sideNav && sideOverlay.dataset.bound !== '1') {
        sideOverlay.dataset.bound = '1';
        sideOverlay.addEventListener('click', () => {
            sideNav.classList.remove('open');
            sideOverlay.classList.remove('active');
        });
    }

    const drawerOverlay = document.getElementById('drawerOverlay');
    const drawer = document.getElementById('userDrawer');
    if (drawerOverlay && drawer && drawerOverlay.dataset.bound !== '1') {
        drawerOverlay.dataset.bound = '1';
        drawerOverlay.addEventListener('click', () => {
            drawer.classList.remove('open');
            drawerOverlay.classList.remove('active');
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

// ---------- Admin helper: fill selects ----------
function preencherSelectsAdmin() {
  // Modalidades em filtros e sorteio
  const modOpts = (adminCache.modalidades || []).map(m => m.nome || m.titulo).filter(Boolean);
  setSelectOptions(document.getElementById('filtInscModalidade'), modOpts, 'Modalidade');
  setSelectOptions(document.getElementById('filtInscTurma'), adminCache.inscricoes.map(i => i.turma).filter(Boolean), 'Turma');
  setSelectOptions(document.getElementById('filtInscCampus'), adminCache.inscricoes.map(i => i.campus).filter(Boolean), 'Campus');
  setSelectOptions(document.getElementById('sorteioModalidade'), modOpts, 'Modalidade');
  setSelectOptions(document.getElementById('sumulaJogo'), (adminCache.jogos||[]).map(j => j.jogo || j.numero_jogo).filter(Boolean), 'Selecione o jogo');
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
        location.href = targetUrl || 'solicitar-otp.html';
        return;
    }
    const card = modal.querySelector('.password-recovery-card');
    const isCompact = targetUrl && targetUrl.includes('primeiro-acesso.html');
    modal.classList.toggle('compact', !!isCompact);
    if (card) {
        card.classList.toggle('compact', !!isCompact);
    }
    const frame = document.getElementById('passwordRecoveryFrame');
    if (frame) frame.src = targetUrl || 'solicitar-otp.html';
    modal.classList.remove('hidden');
}

function closePasswordRecoveryModal() {
    const modal = document.getElementById('passwordRecoveryModal');
    if (!modal) return;
    modal.classList.add('hidden');
    const frame = document.getElementById('passwordRecoveryFrame');
    if (frame) frame.src = 'solicitar-otp.html';
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
    const adminLabel = 'Administracao';
    const modalidadesGroup = isStaffUser() ?
        '' :
        `
      <button class="drawer-btn drawer-toggle" onclick="toggleDrawerGroup('drawerModalidades', this)">
        Modalidades
        <span class="material-symbols-outlined">expand_more</span>
      </button>
      <div id="drawerModalidades" class="drawer-sub">
        <button class="drawer-sub-btn" onclick="openMinhasInscricoes()">Minhas inscricoes</button>
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
          <p id="drawerUserName">${currentUser?.nome || 'Usuario'}</p>
          <small id="drawerUserMatricula">${currentUser?.matricula || ''}</small>
        </div>
      </div>
    </div>
    <div class="drawer-section">
      <div class="drawer-group-title">Menu</div>
      <button class="drawer-btn" onclick="location.href='dashboard.html'">Inicio</button>
      <button class="drawer-btn" onclick="location.href='perfil.html'">Perfil</button>
      ${modalidadesGroup}
      <button class="drawer-btn" onclick="location.href='noticias.html'">Noticias</button>
      <button class="drawer-btn" onclick="location.href='horarios.html'">Horarios</button>
      <button class="drawer-btn" onclick="location.href='resultados.html'">Resultados</button>
      ${isStaffUser() ? `<button class="drawer-btn" onclick="location.href='admin.html'">${adminLabel}</button>` : ''}
      ${isAdminUser() ? `<button class="drawer-btn" onclick="location.href='http://localhost:3005/sumula.html'">Sumula</button>` : ''}
    </div>
    <div class="drawer-footer">
      <div class="drawer-group-title">Configuracoes</div>
      <button class="drawer-btn drawer-toggle" onclick="toggleDrawerGroup('drawerConfig', this)">
        Configuracoes
        <span class="material-symbols-outlined">expand_more</span>
      </button>
      <div id="drawerConfig" class="drawer-sub">
        <button class="drawer-sub-btn" onclick="openPhotoModal()">Alterar foto</button>
        <a class="drawer-sub-btn" href="recuperacao.html#reset">Recuperar senha</a>
        <a class="drawer-sub-btn" href="recuperar-matricula.html">Recuperar matricula</a>
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
        mostrarToastAtencao(data.message || 'Gov.br indisponÃ­vel.');
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
    setError('Preencha matricula e senha.');
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
        const msg = motivo === 'matricula' ? 'MatrÃ­cula invÃ¡lida.' : 'Senha incorreta.';
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
  renderGridSkeleton(document.getElementById('noticiasGrid'), 3);
  renderGridSkeleton(document.getElementById('allNoticiasGrid'), 6);
  fetch('/noticias')
    .then(res => res.json())
    .then(dados => {
      noticias = dados;
      renderNews(dados);
      atualizarDashboard();
    })
    .catch(() => {
      renderEmptyState(document.getElementById('noticiasGrid'), 'Sem notÃ­cias', 'Nenhuma notÃ­cia foi carregada.');
      renderEmptyState(document.getElementById('allNoticiasGrid'), 'Sem notÃ­cias', 'Nenhuma notÃ­cia foi carregada.');
      showToastErro('NÃ£o foi possÃ­vel carregar as notÃ­cias.');
    });
}

function carregarModalidades() {
  renderGridSkeleton(document.getElementById('modalidadesGrid'), 3);
  renderGridSkeleton(document.getElementById('allModalidadesGrid'), 6);
  renderTableSkeleton(document.getElementById('tabelaHorarios'), 4, 4);
  renderTableSkeleton(document.getElementById('adminModalidadesTable'), 4, 5);
  fetch('/modalidades')
    .then(res => res.json())
    .then(dados => {
      modalidades = dados.map(m => ({
        id: m.id,
        nome: m.titulo,
        professor: m.professor,
        dias: m.dias || 'A definir',
        horario: formatarHorario(m.hora_inicio, m.hora_fim),
        horaInicio: m.hora_inicio,
        horaFim: m.hora_fim,
        descricao: m.descricao
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
      renderEmptyState(document.getElementById('modalidadesGrid'), 'Sem modalidades', 'Nenhuma modalidade disponÃ­vel no momento.');
      renderEmptyState(document.getElementById('allModalidadesGrid'), 'Sem modalidades', 'Nenhuma modalidade disponÃ­vel no momento.');
      showToastErro('NÃ£o foi possÃ­vel carregar as modalidades.');
    });
}

function formatarHorario(inicio, fim) {
  if (!inicio || !fim) return '-';
  const hi = inicio.slice(0, 5).replace(':', 'h');
  const hf = fim.slice(0, 5).replace(':', 'h');
  return `${hi} Ã s ${hf}`;
}

function carregarInscricoes() {
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
  fetch(url)
    .then(res => res.json())
    .then(data => {
      inscriptions = Array.isArray(data) ? data : [];
      applyInscricoesFilters();
      renderMinhasInscricoes();
      atualizarDashboard();
      preencherSelectSorteio();
    })
    .catch(() => {
      showToastErro('NÃ£o foi possÃ­vel carregar as inscriÃ§Ãµes.');
      const tbody = document.getElementById('tabelaInscricoes');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8">Nenhuma inscriÃ§Ã£o disponÃ­vel.</td></tr>';
      const minhas = document.getElementById('tabelaMinhasInscricoes');
      if (minhas) minhas.innerHTML = '<tr><td colspan="3">Nenhuma inscriÃ§Ã£o disponÃ­vel.</td></tr>';
    });
}

function renderModalities() {
  const grid = document.getElementById('modalidadesGrid');
  const allGrid = document.getElementById('allModalidadesGrid');

  if (!modalidades.length) {
    renderEmptyState(grid, 'Sem modalidades', 'Nenhuma modalidade disponÃ­vel no momento.');
    renderEmptyState(allGrid, 'Sem modalidades', 'Nenhuma modalidade disponÃ­vel no momento.');
    return;
  }

  const getMeta = (name) => {
    const n = String(name || '').toLowerCase();
    const rules = [
      { keys: ['futebol', 'futsal'], icon: 'sports_soccer', category: 'coletiva' },
      { keys: ['basquete', 'basket'], icon: 'sports_basketball', category: 'coletiva' },
      { keys: ['volei', 'vÃ´lei', 'volley'], icon: 'sports_volleyball', category: 'coletiva' },
      { keys: ['handebol'], icon: 'sports_handball', category: 'coletiva' },
      { keys: ['tenis', 'tÃªnis'], icon: 'sports_tennis', category: 'individual' },
      { keys: ['atletismo', 'corrida', 'caminhada'], icon: 'directions_run', category: 'individual' },
      { keys: ['natacao', 'nataÃ§Ã£o'], icon: 'pool', category: 'individual' },
      { keys: ['xadrez'], icon: 'chess', category: 'individual' },
      { keys: ['judo', 'judÃ´', 'karate', 'karatÃª', 'jiu', 'capoeira'], icon: 'sports_kabaddi', category: 'individual' },
      { keys: ['academia', 'musculacao', 'musculaÃ§Ã£o', 'fitness'], icon: 'fitness_center', category: 'individual' },
    ];
    for (const rule of rules) {
      if (rule.keys.some(k => n.includes(k))) return rule;
    }
    return { icon: 'sports', category: 'coletiva' };
  };

  const html = modalidades.map(m => {
    const meta = getMeta(m.nome);
    const categoryLabel = meta.category === 'coletiva' ? 'Coletiva' : 'Individual';
    return `
    <div class="card" data-name="${m.nome}" data-category="${meta.category}" data-professor="${m.professor || ''}" data-horario="${m.horario || ''}" data-icon="${meta.icon}" onclick="showModalDetails('${m.id}')">
      <div class="card-header">
        <div class="card-icon modalidade-icon"><span class="material-symbols-outlined">${meta.icon}</span></div>
        <div>
          <div class="card-title">${m.nome}</div>
          <span class="modalidade-badge ${meta.category}">${categoryLabel}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="modalidade-meta">
          <span class="material-symbols-outlined">person</span>
          <span>${m.professor || 'Professor a definir'}</span>
        </div>
        <div class="modalidade-meta">
          <span class="material-symbols-outlined">schedule</span>
          <span>${m.horario || 'Horario a definir'}</span>
        </div>
      </div>
    </div>
  `;
  }).join('');

  if (grid) grid.innerHTML = html;
  if (allGrid) allGrid.innerHTML = html;
}

function renderNews(lista) {
  const grid = document.getElementById('noticiasGrid');
  const allGrid = document.getElementById('allNoticiasGrid');
  if (!lista || lista.length === 0) {
    renderEmptyState(allGrid, 'Sem notÃ­cias', 'Nenhuma notÃ­cia publicada.');
    renderEmptyState(grid, 'Sem notÃ­cias', 'Nenhuma notÃ­cia publicada.');
    return;
  }
  const ordered = [...lista].sort((a, b) => new Date(b.data_publicacao) - new Date(a.data_publicacao));

  const htmlAll = ordered.map(n => `
    <div class="card">
      <div class="card-header">
        <div class="card-icon"><span class="material-symbols-outlined">article</span></div>
        <div class="card-title">${n.titulo}</div>
      </div>
      <div class="card-body">
        <p>${n.descricao}</p>
        <small>${new Date(n.data_publicacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' Ã s')}</small>
        ${n.data_edicao ? `<small class="muted">Editado em: ${new Date(n.data_edicao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' Ã s')}</small>` : ''}
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
    <div class="card">
      <div class="card-header">
        <div class="card-icon"><span class="material-symbols-outlined">article</span></div>
        <div class="card-title">${n.titulo}</div>
      </div>
      <div class="card-body">
        <p>${n.descricao}</p>
        <small>${new Date(n.data_publicacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' Ã s')}</small>
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
    tbody.innerHTML = '<tr><td colspan="4">Nenhum horÃ¡rio disponÃ­vel.</td></tr>';
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
  if (submitBtn) submitBtn.textContent = 'Salvar alteraÃ§Ãµes';
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
    tbody.innerHTML = '<tr><td colspan="3">VocÃª ainda nÃ£o estÃ¡ inscrito em nenhuma modalidade.</td></tr>';
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
    showToastErro('NÃ£o hÃ¡ inscriÃ§Ãµes para exportar.');
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
    showToastErro('NÃ£o hÃ¡ modalidades para exportar.');
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
        showToastErro('Tipo de exportaÃ§Ã£o nÃ£o reconhecido.');
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

function loadAdminMetrics() {
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
      // silencioso, evita ruÃ­do no admin
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
}

function showModalDetails(modalidadeId) {
  const mod = modalidades.find(m => String(m.id) === String(modalidadeId));
  if (!mod) return;
  currentInscription = mod;
  document.getElementById('detailTitle').textContent = mod.nome;
  document.getElementById('detailContent').innerHTML = `
    <strong>Professor:</strong> <p>${mod.professor}</p>
    <strong>Dias:</strong> <p>${mod.dias}</p>
    <strong>HorÃ¡rio:</strong> <p>${mod.horario}</p>
    <strong>DescriÃ§Ã£o:</strong> <p>${mod.descricao}</p>
  `;
  const confirmarBtn = document.querySelector('#detailModal .btn-primary');
  if (confirmarBtn) confirmarBtn.style.display = isStaffUser() ? 'none' : '';
  openModal('detailModal');
}

function confirmInscription() {
  if (!currentUser || !currentInscription) return;
  if (isStaffUser()) {
    showToastErro('Administradores e professores nÃ£o podem se inscrever.');
    return;
  }
  subscribeToJICS(currentInscription.id);
}

function subscribeToJICS(modalidadeId) {
  if (isStaffUser()) {
    showToastErro('Administradores e professores nÃ£o podem se inscrever.');
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
        mostrarToastAtencao(data.mensagem || 'NÃ£o foi possÃ­vel inscrever');
        return;
      }
      showToastSucesso('InscriÃ§Ã£o realizada com sucesso!');
      closeModal('detailModal');
      carregarInscricoes();
    })
    .catch(() => showToastErro('Erro ao realizar inscriÃ§Ã£o'));
}

function resolveModalidadeIdByName(nome) {
  const label = String(nome || '').trim().toLowerCase();
  if (!label) return null;
  const mod = modalidades.find(m => String(m.nome || '').trim().toLowerCase() === label);
  return mod ? mod.id : null;
}

function cancelarInscricao(inscricaoIdEnc, matriculaEnc, modalidadeIdEnc, modalidadeEnc) {
  if (!currentUser) {
    showToastErro('Usuario nÃ£o identificado.');
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
    showToastErro('NÃ£o foi possÃ­vel identificar a inscriÃ§Ã£o.');
    return;
  }

  openDangerConfirm({
    title: 'Cancelar inscriÃ§Ã£o',
    message: `Digite CONFIRMAR para cancelar a inscriÃ§Ã£o${modalidadeLabel ? ` em ${modalidadeLabel}` : ''}.`,
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
            showToastSucesso('InscriÃ§Ã£o cancelada.');
            carregarInscricoes();
          } else {
            showToastErro(data?.mensagem || 'NÃ£o foi possÃ­vel cancelar.');
          }
        })
        .catch(() => showToastErro('Erro ao cancelar inscriÃ§Ã£o.'));
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
  const inputEl = document.getElementById('dangerConfirmInput');
  const btnEl = document.getElementById('dangerConfirmBtn');

  dangerConfirmAction = onConfirm || null;
  if (titleEl) titleEl.textContent = title || 'Confirmar aÃ§Ã£o';
  if (textEl) textEl.textContent = message || 'Digite CONFIRMAR para continuar.';
  if (inputEl) {
    inputEl.value = '';
    inputEl.oninput = () => {
      const ok = inputEl.value.trim().toUpperCase() === 'CONFIRMAR';
      if (btnEl) btnEl.disabled = !ok;
    };
  }
  if (btnEl) btnEl.disabled = true;
  modal.classList.remove('hidden');
}

function closeDangerConfirm() {
  const modal = document.getElementById('modalDangerConfirm');
  if (modal) modal.classList.add('hidden');
  dangerConfirmAction = null;
}

function confirmDangerAction() {
  const inputEl = document.getElementById('dangerConfirmInput');
  if (!inputEl || inputEl.value.trim().toUpperCase() !== 'CONFIRMAR') return;
  if (typeof dangerConfirmAction === 'function') dangerConfirmAction();
  closeDangerConfirm();
}

function verNoticia(id) {
  const noticia = noticias.find(n => n.id === id);
  if (!noticia) return;
  document.getElementById('verTitulo').textContent = noticia.titulo;
  document.getElementById('verDescricao').textContent = noticia.descricao;
  document.getElementById('verPublicacao').textContent =
    'Publicado em: ' + new Date(noticia.data_publicacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' Ã s');
  document.getElementById('verEdicao').textContent = noticia.data_edicao
    ? 'Editado em: ' + new Date(noticia.data_edicao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' Ã s')
    : '';
  openModal('modalVerNoticia');
}

function fecharModalVer() {
  closeModal('modalVerNoticia');
}

function excluirNoticia(id) {
  if (currentUser?.role !== 'ADMIN') return;
  openDangerConfirm({
    title: 'Excluir notÃ­cia',
    message: 'Digite CONFIRMAR para excluir esta notÃ­cia.',
    onConfirm: () => confirmarExclusaoNoticia(id),
  });
}

function fecharModalExcluir() {
  noticiaParaExcluir = null;
  closeModal('modalExcluir');
}

function confirmarExclusaoNoticia(id) {
  fetch(`/noticias/${id}`, { method: 'DELETE' })
    .then(() => {
      carregarNoticias();
      showToastSucesso('NotÃ­cia excluÃ­da!');
    })
    .catch(() => showToastErro('Erro ao excluir notÃ­cia'));
}

function switchAdminTab(tabId, btn) {
  document.querySelectorAll('.tab-content, .admin-panel').forEach(el => {
    el.classList.remove('active');
    if (el.classList.contains('tab-content')) el.style.display = 'none';
  });
  document.querySelectorAll('.admin-tab, .pill-tab').forEach(el => el.classList.remove('active', 'pill-tab-active'));
  const tab = document.getElementById(tabId);
  if (tab) {
    tab.classList.add('active');
    tab.style.display = 'block';
  }
  const targetBtn = btn || document.querySelector(`.admin-tab[data-tab="${tabId}"], .pill-tab[data-tab="${tabId}"]`);
  if (targetBtn) {
    targetBtn.classList.add('active');
    if (targetBtn.classList.contains('pill-tab')) targetBtn.classList.add('pill-tab-active');
  }
  const crumb = document.getElementById('adminCrumb');
  const sideLink = document.querySelector(`.side-link[data-tab="${tabId}"]`);
  if (crumb) crumb.textContent = (targetBtn || sideLink) ? (targetBtn || sideLink).textContent : 'Admin';
  localStorage.setItem('adminTab', tabId);
  adminActiveTab = tabId;
  if (typeof window.handleAdminTabSwitch === 'function') {
    window.handleAdminTabSwitch(tabId);
  }

  document.querySelectorAll('.side-link[data-tab]').forEach(link => {
    link.classList.toggle('active', link.dataset.tab === tabId);
  });
}

function applyAdminTabVisibility() {
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !isAdminUser());
  });
  document.querySelectorAll('.staff-only').forEach(el => {
    el.classList.toggle('hidden', !isStaffUser());
  });

  const active = document.querySelector('.admin-tab.active');
  if (active && active.classList.contains('hidden')) {
    const first = document.querySelector('.admin-tab:not(.hidden)');
    if (first) switchAdminTab(first.dataset.tab, first);
  }
}

function openAdminTab(tabId) {
  if (!isStaffUser()) {
    showToastErro('Acesso restrito.');
    return;
  }
  if (document.body.dataset.page === 'admin') {
    switchAdminTab(tabId);
    return;
  }
  localStorage.setItem('adminTab', tabId);
  location.href = 'admin.html';
}

function publicarNoticia(event) {
  if (event) event.preventDefault();
  if (!isStaffUser()) return showToastErro('Acesso restrito.');
  const titulo = document.getElementById('tituloNoticia')?.value?.trim();
  const descricao = document.getElementById('descricaoNoticia')?.value?.trim();
  if (!titulo || !descricao) return showToastErro('Preencha tÃ­tulo e descriÃ§Ã£o.');
  fetch('/admin/noticias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo, descricao })
  })
    .then(res => res.json())
    .then(data => {
      if (!data.sucesso) return showToastErro('Erro ao publicar notÃ­cia');
      showToastSucesso('NotÃ­cia publicada!');
      if (event && event.target?.reset) event.target.reset();
      carregarNoticias();
    })
    .catch(() => showToastErro('Erro ao publicar notÃ­cia'));
}

function excluirNoticiaAdmin(id) {
  if (!confirm('Excluir esta notÃ­cia?')) return;
  fetch(`/noticias/${id}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if (!data.sucesso) return showToastErro('Erro ao excluir notÃ­cia');
      showToastSucesso('NotÃ­cia excluÃ­da!');
      carregarNoticias();
    })
    .catch(() => showToastErro('Erro ao excluir notÃ­cia'));
}

function addModalidade(event) {
  event.preventDefault();
  if (!isStaffUser()) {
    showToastErro('Acesso restrito.');
    return;
  }
  const titulo = document.getElementById('modalidadeTitulo').value;
  const descricao = document.getElementById('modalidadeDescricao').value;
  const professor = document.getElementById('modalidadeProfessor').value;
  const horaInicio = document.getElementById('horaInicio').value;
  const horaFim = document.getElementById('horaFim').value;
  const diasSelecionados = Array.from(document.querySelectorAll('.dias-semana input:checked')).map(el => el.value);

  if (diasSelecionados.length === 0 || diasSelecionados.length > 2) {
    mostrarToastAtencao('Selecione atÃ© 2 dias de treino.');
    return;
  }

  const dias = diasSelecionados.join(' e ');

  const endpoint = modalidadeEditId ? `/admin/modalidades/${modalidadeEditId}` : '/admin/modalidades';
  const method = modalidadeEditId ? 'PUT' : 'POST';

  fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo, descricao, professor, hora_inicio: horaInicio, hora_fim: horaFim, dias })
  })
    .then(res => res.json())
    .then(data => {
      if (!data.sucesso) {
        showToastErro('Erro ao cadastrar modalidade');
        return;
      }
      if (modalidadeEditId) {
        showToastSucesso('Modalidade atualizada!');
        cancelarEdicaoModalidade();
      } else {
        showToastSucesso('Modalidade cadastrada!');
        event.target.reset();
      }
      carregarModalidades();
    })
    .catch(() => showToastErro('Erro ao cadastrar modalidade'));
}

function excluirModalidade(id) {
  if (!isAdminUser()) {
    showToastErro('Acesso restrito.');
    return;
  }
  openDangerConfirm({
    title: 'Excluir modalidade',
    message: 'Digite CONFIRMAR para remover esta modalidade.',
    onConfirm: () => {
      fetch(`/admin/modalidades/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
          if (!data.sucesso) {
            showToastErro('Erro ao excluir modalidade');
            return;
          }
          showToastSucesso('Modalidade removida!');
          carregarModalidades();
        })
        .catch(() => showToastErro('Erro ao excluir modalidade'));
    }
  });
}

function addUser(event) {
  event.preventDefault();
  if (!isAdminUser()) {
    showToastErro('Acesso restrito.');
    return;
  }

  const form = document.getElementById('newUserForm');
  const msg = document.getElementById('newUserMsg');
  const matriculaInput = document.getElementById('newMatricula');
  const nomeInput = document.getElementById('newNome');
  const campusInput = document.getElementById('newCampus');
  const cursoInput = document.getElementById('newCurso');
  const turmaInput = document.getElementById('newTurma');
  const nascimentoInput = document.getElementById('newNascimento');
  const emailInput = document.getElementById('newEmail');
  const senhaInput = document.getElementById('newSenha');

  const setMsg = (text, type = 'error') => {
    if (!msg) return;
    msg.textContent = text || '';
    msg.classList.remove('show', 'success', 'error');
    if (text) msg.classList.add('show', type === 'success' ? 'success' : 'error');
  };

  const clearError = (input) => {
    if (input) input.classList.remove('input-erro');
  };

  const setError = (input) => {
    if (input) input.classList.add('input-erro');
  };

  const bindClear = (input) => {
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('input', () => {
      clearError(input);
      setMsg('');
    });
  };

  [matriculaInput, nomeInput, campusInput, cursoInput, turmaInput, nascimentoInput, emailInput, senhaInput]
    .forEach(bindClear);

  setMsg('');
  [matriculaInput, nomeInput, campusInput, cursoInput, turmaInput, nascimentoInput, emailInput, senhaInput]
    .forEach(clearError);

  if (matriculaInput.classList.contains('input-erro')) {
    setMsg('Corrija a matricula antes de cadastrar.');
    matriculaInput.focus();
    return;
  }

  const matricula = (matriculaInput?.value || '').trim();
  const nome = (nomeInput?.value || '').trim();
  const campus = (campusInput?.value || '').trim();
  const cursoRaw = (cursoInput?.value || '').trim();
  const turma = (turmaInput?.value || '').trim();
  const nascimento = (nascimentoInput?.value || '').trim();
  const email = (emailInput?.value || '').trim();
  const senha = (senhaInput?.value || '').trim();

  const errors = [];
  if (!matricula || matricula.length !== 13) { setError(matriculaInput); errors.push(matriculaInput); }
  if (!nome) { setError(nomeInput); errors.push(nomeInput); }
  if (!campus) { setError(campusInput); errors.push(campusInput); }
  if (!cursoRaw) { setError(cursoInput); errors.push(cursoInput); }
  if (!turma) { setError(turmaInput); errors.push(turmaInput); }
  if (!nascimento) { setError(nascimentoInput); errors.push(nascimentoInput); }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) { setError(emailInput); errors.push(emailInput); }
  if (senha.length < 8) { setError(senhaInput); errors.push(senhaInput); }

  if (errors.length) {
    setMsg('Preencha todos os campos obrigatorios corretamente.');
    errors[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    errors[0].focus({ preventScroll: true });
    return;
  }

  const resolveCursoDescricao = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (normalized.includes('informatica')) return 'Tecnico em Informatica Integrado ao Ensino Medio';
    if (normalized.includes('quimica')) return 'Tecnico em Quimica Integrado ao Ensino Medio';
    if (normalized.includes('edific')) return 'Tecnico em Edificacoes Integrado ao Ensino Medio';
    if (normalized.includes('eletro')) return 'Tecnico em Eletrotecnica Integrado ao Ensino Medio';
    return raw;
  };

  const aluno = {
    matricula,
    nome,
    campus,
    descricao_curso: resolveCursoDescricao(cursoRaw),
    turma,
    data_nascimento: nascimento,
    email_pessoal: email,
    senha
  };

  const roleSelect = document.getElementById('newRole');
  if (roleSelect && isAdminUser()) {
    aluno.role = roleSelect.value;
  }

  fetch('/admin/add-aluno', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(aluno)
  })
    .then(res => res.json())
    .then(data => {
      if (!data.sucesso) {
        if (data.mensagem && String(data.mensagem).toLowerCase().includes('curso')) {
          setError(cursoInput);
        }
        setMsg(data.mensagem || 'Erro ao cadastrar aluno');
        return;
      }
      setMsg('Aluno cadastrado com sucesso.', 'success');
      showToastSucesso('Aluno cadastrado com sucesso!');
      if (form) form.reset();
      if (roleSelect) roleSelect.value = 'ALUNO';
      const status = document.getElementById('matriculaStatus');
      if (status) status.textContent = '';
    })
    .catch(() => setMsg('Erro ao conectar com o servidor'));
}

function onMatriculaInput() {
  const input = document.getElementById('newMatricula');
  if (!input) return;
  const valor = input.value.replace(/\D/g, '');
  input.value = valor;
  if (valor.length !== 13) return;
  verificarMatriculaAutomatica(valor);
}

function verificarMatriculaAutomatica(matricula) {
  const input = document.getElementById('newMatricula');
  const status = document.getElementById('matriculaStatus');
  fetch(`/admin/verificar-matricula/${matricula}`)
    .then(res => res.json())
    .then(data => {
      if (data.existe) {
        input.classList.add('input-erro');
        status.textContent = 'Esta matrÃ­cula jÃ¡ possui cadastro';
      } else {
        input.classList.remove('input-erro');
        status.textContent = '';
      }
    })
    .catch(() => { status.textContent = ''; });
}

function editarSenha() {
  location.href = 'recuperacao.html#reset';
}

function closeModalSenha() {
  closeModal('modalSenha');
  const atual = document.getElementById('senhaAtualInput');
  const nova = document.getElementById('novaSenhaInput');
  const confirmar = document.getElementById('confirmarSenhaInput');
  if (atual) atual.value = '';
  if (nova) nova.value = '';
  if (confirmar) confirmar.value = '';
  if (passwordUxModal && typeof passwordUxModal.evaluate === 'function') {
    passwordUxModal.evaluate();
  }
}

function confirmarAlteracaoSenha() {
  const senhaAtual = document.getElementById('senhaAtualInput').value;
  const novaSenha = document.getElementById('novaSenhaInput').value;
  const confirmarSenha = document.getElementById('confirmarSenhaInput')?.value;
  if (!senhaAtual || !novaSenha || !confirmarSenha) {
    showToastErro('Preencha todos os campos');
    return;
  }
  if (passwordUxModal && !passwordUxModal.isValid()) {
    showToastErro('Senha nao atende aos requisitos.');
    return;
  }
  senhaPendente = { senhaAtual, novaSenha };
  closeModal('modalSenha');
  openModal('modalConfirmarSenha');
}

function closeModalConfirmar() { closeModal('modalConfirmarSenha'); senhaPendente = null; }

function confirmarTrocaSenha() {
  if (!senhaPendente || !currentUser) return;
  fetch('/alterar-senha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matricula: currentUser.matricula, ...senhaPendente })
  })
    .then(res => res.json())
    .then(data => {
      if (data.sucesso) showToastSucesso('Senha alterada com sucesso!');
      else if (data.tipo === 'senha_atual_incorreta') showToastErro('Senha atual incorreta');
      else if (data.tipo === 'mesma_senha') showToastErro('Essa senha jÃ¡ estÃ¡ cadastrada');
      else showToastErro('Erro ao alterar senha');
      closeModalConfirmar();
    })
    .catch(() => showToastErro('Erro ao alterar senha'));
}

let photoState = {
  src: null,
  scale: 1,
  x: 0,
  y: 0,
  objectUrl: null,
  dragging: false,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  pinchStartDist: 0,
  pinchStartScale: 1,
  inited: false,
  area: null,
  img: null
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyPhotoTransform() {
  if (!photoState.img) return;
  photoState.img.style.transform =
    `translate(calc(-50% + ${photoState.x}px), calc(-50% + ${photoState.y}px)) scale(${photoState.scale})`;
}

function getCropperElements() {
  return {
    area: document.getElementById('cropArea'),
    img: document.getElementById('cropImg')
  };
}

function initPhotoCropper() {
  if (photoState.inited) return;
  const { area, img } = getCropperElements();
  if (!area || !img) return;
  photoState.area = area;
  photoState.img = img;
  photoState.inited = true;

  area.style.cursor = 'grab';

  area.addEventListener('dragstart', (e) => e.preventDefault());

  area.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    photoState.dragging = true;
    photoState.startX = e.clientX;
    photoState.startY = e.clientY;
    photoState.lastX = photoState.x;
    photoState.lastY = photoState.y;
    area.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', () => {
    photoState.dragging = false;
    area.style.cursor = 'grab';
  });

  window.addEventListener('mousemove', (e) => {
    if (!photoState.dragging) return;
    photoState.x = photoState.lastX + (e.clientX - photoState.startX);
    photoState.y = photoState.lastY + (e.clientY - photoState.startY);
    applyPhotoTransform();
  });

  area.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.08 : -0.08;
    photoState.scale = clamp(photoState.scale + step, 1, 3);
    applyPhotoTransform();
  }, { passive: false });

  area.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      photoState.dragging = true;
      photoState.startX = touch.clientX;
      photoState.startY = touch.clientY;
      photoState.lastX = photoState.x;
      photoState.lastY = photoState.y;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      photoState.pinchStartDist = Math.hypot(dx, dy);
      photoState.pinchStartScale = photoState.scale;
    }
  }, { passive: false });

  area.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (photoState.pinchStartDist) {
        const ratio = dist / photoState.pinchStartDist;
        photoState.scale = clamp(photoState.pinchStartScale * ratio, 1, 3);
        applyPhotoTransform();
      }
      return;
    }
    if (!photoState.dragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    photoState.x = photoState.lastX + (touch.clientX - photoState.startX);
    photoState.y = photoState.lastY + (touch.clientY - photoState.startY);
    applyPhotoTransform();
  }, { passive: false });

  area.addEventListener('touchend', () => {
    photoState.dragging = false;
  });

  const btnCenter = document.getElementById('btnCenter');
  const btnFit = document.getElementById('btnFit');
  if (btnCenter) {
    btnCenter.addEventListener('click', () => {
      photoState.x = 0;
      photoState.y = 0;
      applyPhotoTransform();
    });
  }
  if (btnFit) {
    btnFit.addEventListener('click', () => {
      photoState.scale = 1;
      photoState.x = 0;
      photoState.y = 0;
      applyPhotoTransform();
    });
  }
}

function openPhotoModal() {
  openModal('modalFoto');
  initPhotoCropper();
}

function closePhotoModal() {
  closeModal('modalFoto');
  if (photoState.objectUrl) {
    URL.revokeObjectURL(photoState.objectUrl);
  }
  photoState = { ...photoState, src: null, scale: 1, x: 0, y: 0, objectUrl: null };
  const { img } = getCropperElements();
  if (img) img.src = '';
}

function loadPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (photoState.objectUrl) URL.revokeObjectURL(photoState.objectUrl);
  const url = URL.createObjectURL(file);
  photoState.objectUrl = url;
  setPhoto(url);
}

function setPhoto(src) {
  initPhotoCropper();
  if (!photoState.img) return;
  photoState.src = src;
  photoState.img.src = src;
  photoState.img.onload = () => {
    photoState.scale = 1;
    photoState.x = 0;
    photoState.y = 0;
    applyPhotoTransform();
  };
}

function savePhoto() {
  if (!photoState.src) return;
  const canvas = document.createElement('canvas');
  const size = 320;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    const scale = photoState.scale;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const x = (size - drawW) / 2 + photoState.x;
    const y = (size - drawH) / 2 + photoState.y;
    ctx.drawImage(img, x, y, drawW, drawH);
    const dataUrl = canvas.toDataURL('image/png');
    if (currentUser) {
      currentUser.foto = dataUrl;
      sessionStorage.setItem('usuarioLogado', JSON.stringify(currentUser));
      const key = getPhotoStorageKey(currentUser.matricula);
      if (key) {
        localStorage.setItem(key, dataUrl);
      }
    }
    const avatar = document.getElementById('userAvatar');
    const drawerAvatar = document.getElementById('drawerAvatar');
    if (avatar) avatar.src = dataUrl;
    if (drawerAvatar) drawerAvatar.src = dataUrl;
    closePhotoModal();
  };
  img.src = photoState.src;
}

function showToastSucesso(msg) {
  if (window.SuccessFeedback && typeof window.SuccessFeedback.show === 'function') {
    window.SuccessFeedback.show({ title: 'Concluido!', message: msg });
    return;
  }
  const toast = document.getElementById('toastSucesso');
  if (!toast) return;
  document.getElementById('toastSucessoMsg').textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, 4000);
}

function showToastErro(msg) {
  const toast = document.getElementById('toastErro');
  if (!toast) return;
  document.getElementById('toastErroMsg').textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, 4000);
}

function mostrarToastAtencao(msg) {
  const toast = document.getElementById('toastAtencao');
  if (!toast) return;
  document.getElementById('toastAtencaoMsg').textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, 4000);
}

function populateModalidadeSelects() {
  const selects = [
    document.getElementById('sumulaModalidade'),
    document.getElementById('filtroModalidade')
  ].filter(Boolean);

  selects.forEach(select => {
    const current = select.value;
    const placeholder = select.id === 'filtroModalidade' ? 'Modalidade' : 'Selecione...';
    select.innerHTML = `<option value="">${placeholder}</option>` + modalidades.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
    select.value = current;
  });
}

function getResultados() {
  return JSON.parse(localStorage.getItem('resultados') || '[]');
}

function setResultados(lista) {
  localStorage.setItem('resultados', JSON.stringify(lista));
}

function salvarSumula(event, fromMobile = false) {
  if (event) event.preventDefault();
  const dados = getSumulaFormData();

  if (!dados.modalidade || !dados.equipeA || !dados.equipeB) {
    showToastErro('Preencha todos os campos obrigatÃ³rios');
    return;
  }

  const lista = getResultados();
  lista.unshift(dados);
  setResultados(lista);
  renderResultadosLista();
  renderClassification();
  showToastSucesso('Sumula salva com sucesso!');
  if (fromMobile) {
    document.querySelector('form').reset();
  }
}

// ------------------ ADMIN DATA LOADERS --------------------
function handleAdminSessionExpired(message) {
  if (window.__adminSessionExpired) return;
  window.__adminSessionExpired = true;
  try {
    sessionStorage.setItem('adminSessionExpired', '1');
  } catch (_) {}
  const banner = document.getElementById('sessionBanner');
  const text = document.getElementById('sessionBannerText');
  if (text) text.textContent = message || 'SessÃ£o expirada. FaÃ§a login novamente.';
  if (banner) banner.classList.remove('hidden');
}

async function adminFetch(url, fallback = []) {
  try {
    if (window.__adminSessionExpired) return fallback;
    const r = await fetch(url, { credentials: 'include' });
    if (r.status === 401) {
      handleAdminSessionExpired('SessÃ£o expirada. FaÃ§a login novamente.');
      return fallback;
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    console.warn('Admin fetch fallback', url, e);
    return fallback;
  }
}

// Toast simples
function showToast(msg, type = 'info') {
  if ((type === 'info' || type === 'success') && window.SuccessFeedback && typeof window.SuccessFeedback.show === 'function') {
    window.SuccessFeedback.show({ title: 'Concluido!', message: msg });
    return;
  }
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.classList.remove('toast-error', 'toast-warning');
  if (type === 'error') el.classList.add('toast-error');
  if (type === 'warning') el.classList.add('toast-warning');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => { if (el) el.classList.remove('show'); }, 2600);
}

function renderTableBody(tbodyId, rows, renderer, emptyCols = 4) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${emptyCols}" style="text-align:center;">Nenhum dado</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(renderer).join('');
}

function renderSkeletonTable(tbodyId, rows = 5, cols = 6) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = Array.from({ length: rows }).map(() => `
    <tr>
      ${Array.from({ length: cols }).map(() => `
        <td><div class="skeleton skeleton-line" style="width: 100%;"></div></td>
      `).join('')}
    </tr>
  `).join('');
}

function renderSkeletonCards(containerId, count = 4) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-line" style="width: 40%;"></div>
      <div class="skeleton skeleton-line" style="width: 70%;"></div>
      <div class="skeleton skeleton-line" style="width: 60%;"></div>
    </div>
  `).join('');
}

function renderStatusPill(status) {
  const normalized = String(status || '').toUpperCase();
  const map = {
    NAO_INICIADO: { label: 'NÃ£o iniciado', cls: 'status-nao_iniciado' },
    AGENDADO: { label: 'Agendado', cls: 'status-nao_iniciado' },
    EM_ANDAMENTO: { label: 'Em andamento', cls: 'status-em_andamento' },
    FINALIZADO: { label: 'Finalizado', cls: 'status-finalizado' },
  };
  const item = map[normalized] || { label: normalized, cls: 'status-nao_iniciado' };
  return `<span class="status-pill ${item.cls}">${item.label}</span>`;
}

async function loadAdminMetrics() {
  const data = await adminFetch('/api/admin/metrics', null);
  const safe = data && typeof data === 'object' ? data : {};
  const m = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '-'; };
  m('metricUsuarios', safe.usuarios ?? 0);
  m('metricInscricoes', safe.inscricoes ?? 0);
  m('metricModalidades', safe.modalidades ?? 0);
  m('metricComunicados', safe.comunicados ?? 0);
}

function renderAdminInscricoesTable(rows) {
  const tbody = document.getElementById('inscBody');
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhuma inscriÃ§Ã£o encontrada.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.aluno || '-'}</td>
      <td>${r.matricula || '-'}</td>
      <td>${r.turma || '-'}</td>
      <td>${r.modalidade || '-'}</td>
      <td>${r.sexo || '-'}</td>
      <td>${r.data || '-'}</td>
      <td><span class="badge-acao">Ver detalhes</span></td>
    </tr>`).join('');
}

function applyAdminInscricoesSearch() {
  const termo = (document.getElementById('filtInscBusca')?.value || '').trim().toLowerCase();
  const base = Array.isArray(adminCache.inscricoes) ? adminCache.inscricoes : [];
  if (!termo) {
    renderAdminInscricoesTable(base);
    return;
  }
  const filtrado = base.filter(r => {
    const texto = [
      r.aluno,
      r.matricula,
      r.turma,
      r.modalidade,
      r.sexo,
      r.campus,
      r.data
    ].filter(Boolean).join(' ').toLowerCase();
    return texto.includes(termo);
  });
  renderAdminInscricoesTable(filtrado);
}

async function loadInscricoesAdmin() {
  // filtros
  const params = new URLSearchParams();
  const fModal = document.getElementById('filtInscModalidade');
  const fSexo = document.getElementById('filtInscSexo');
  const fTurma = document.getElementById('filtInscTurma');
  const fCampus = document.getElementById('filtInscCampus');
  if (fModal && fModal.value) params.append('modalidade', fModal.value);
  if (fSexo && fSexo.value) params.append('sexo', fSexo.value);
  if (fTurma && fTurma.value) params.append('turma', fTurma.value);
  if (fCampus && fCampus.value) params.append('campus', fCampus.value);

  const data = await adminFetch('/api/inscricoes' + (params.toString() ? `?${params}` : ''), []);
  adminCache.inscricoes = data;
  applyAdminInscricoesSearch();
  preencherSelectsAdmin();
}

async function loadUsuariosAdmin() {
  const q = document.getElementById('searchUser');
  const url = q && q.value ? `/api/usuarios?busca=${encodeURIComponent(q.value)}` : '/api/usuarios';
  const data = await adminFetch(url, []);
  adminCache.usuarios = data;
  renderTableBody('usersBody', data, r => `
      <tr>
        <td>${r.nome || '-'}</td>
        <td>${r.matricula || '-'}</td>
        <td>${r.turma || '-'}</td>
        <td>
          <span class="badge-acao" onclick="editUser('${r.matricula||''}')">Editar</span>
          <span class="badge-acao" onclick="deleteUser('${r.matricula||''}')">Excluir</span>
          <span class="badge-acao" onclick="resetPassUser('${r.matricula||''}')">Resetar senha</span>
        </td>
      </tr>`, 4);
}

async function loadNoticiasAdmin() {
  const data = await adminFetch('/noticias', []);
  adminCache.noticias = data;
  renderTableBody('newsBody', data, r => `
    <tr>
      <td>${r.titulo || '-'}</td>
      <td>${r.autor || '-'}</td>
      <td>${r.data || '-'}</td>
      <td><span class="badge-acao" onclick="editNews('${r.id||''}')">Editar</span> <span class="badge-acao" onclick="deleteNews('${r.id||''}')">Excluir</span></td>
    </tr>`, 4);
}

async function loadModalidadesAdmin() {
  const data = await adminFetch('/modalidades', []);
  adminCache.modalidades = data;
  renderTableBody('modsBody', data, r => `
    <tr>
      <td>${r.nome || r.titulo || '-'}</td>
      <td>${r.horario || '-'}</td>
      <td><span class="badge-acao" onclick="editMod('${r.id||''}')">Editar</span> <span class="badge-acao" onclick="deleteMod('${r.id||''}')">Excluir</span></td>
    </tr>`, 3);
  preencherSelectSorteio();
  preencherSelectsAdmin();
}

function initAdminPage() {
  if (adminDataLoaded) return;
  const body = document.body;
  if (body && body.classList.contains('admin-shell')) {
    adminDataLoaded = true;
    if (window.__adminSessionExpired) return;
    // tema
    const t = localStorage.getItem('themeAdmin');
    if (t) body.dataset.theme = t;
    // tab ativa
    const tabId = localStorage.getItem('adminTab') || adminActiveTab || 'tabDashboard';
    switchAdminTab(tabId);
    // dados
    loadAdminMetrics();
    loadInscricoesAdmin();
    loadUsuariosAdmin();
    loadNoticiasAdmin();
    loadModalidadesAdmin();
    // carregamento inicial de jogos/sorteio
    carregarTabelaSorteio();
  }
}

document.addEventListener('DOMContentLoaded', initAdminPage);

// ------ AÃ§Ãµes rÃ¡pidas de botÃµes (CRUD simples) ------
async function adminPost(url, body) {
  if (window.__adminSessionExpired) throw new Error('SessÃ£o expirada.');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body||{})
  });
  if (r.status === 401) {
    handleAdminSessionExpired('SessÃ£o expirada. FaÃ§a login novamente.');
    throw new Error('SessÃ£o expirada.');
  }
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
async function adminPut(url, body) {
  if (window.__adminSessionExpired) throw new Error('SessÃ£o expirada.');
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body||{})
  });
  if (r.status === 401) {
    handleAdminSessionExpired('SessÃ£o expirada. FaÃ§a login novamente.');
    throw new Error('SessÃ£o expirada.');
  }
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
async function adminDelete(url) {
  if (window.__adminSessionExpired) throw new Error('SessÃ£o expirada.');
  const r = await fetch(url, { method: 'DELETE', credentials: 'include' });
  if (r.status === 401) {
    handleAdminSessionExpired('SessÃ£o expirada. FaÃ§a login novamente.');
    throw new Error('SessÃ£o expirada.');
  }
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

async function createUser() {
  const nome = prompt('Nome completo do usuÃ¡rio:');
  const matricula = prompt('MatrÃ­cula:');
  const turma = prompt('Turma:');
  const role = prompt('Papel (ADMIN/PROFESSOR/ALUNO):','ALUNO');
  if (!nome || !matricula) return;
  try {
    await adminPost('/admin/add-aluno', { nome, matricula, turma, role });
    showToast('Usuario criado', 'info');
    loadUsuariosAdmin();
  } catch(e){ showToast('Erro ao criar usuÃ¡rio','error'); }
}

async function editUser(matricula) {
  if (!matricula) return;
  const nome = prompt('Novo nome (deixe vazio para manter):');
  const turma = prompt('Nova turma (opcional):');
  try {
    await adminPut(`/admin/aluno/${encodeURIComponent(matricula)}`, { nome: nome||undefined, turma: turma||undefined });
    showToast('Usuario atualizado','info');
    loadUsuariosAdmin();
  } catch(e){ showToast('Erro ao atualizar','error'); }
}

async function deleteUser(matricula) {
  if (!matricula) return;
  if (!confirm('Excluir este usuÃ¡rio?')) return;
  try {
    await adminDelete(`/admin/aluno/${encodeURIComponent(matricula)}`);
    showToast('Usuario removido','info');
    loadUsuariosAdmin();
  } catch(e){ showToast('Erro ao remover','error'); }
}

async function resetPassUser(matricula) {
  if (!matricula) return;
  try {
    await adminPost(`/admin/aluno/${encodeURIComponent(matricula)}/reset-senha`, {});
    showToast('Senha resetada (token enviado)','info');
  } catch(e){ showToast('Erro ao resetar','error'); }
}

async function createNews() {
  const titulo = prompt('TÃ­tulo da notÃ­cia:');
  const descricao = prompt('DescriÃ§Ã£o:');
  if (!titulo || !descricao) return;
  try {
    await adminPost('/admin/noticias', { titulo, descricao });
    showToast('NotÃ­cia publicada','info');
    loadNoticiasAdmin();
  } catch(e){ showToast('Erro ao publicar','error'); }
}
async function saveNews(event) {
  if (event) event.preventDefault();
  const titulo = document.getElementById('newsTitulo')?.value.trim();
  const autor = document.getElementById('newsAutor')?.value.trim();
  const data = document.getElementById('newsData')?.value;
  const descricao = document.getElementById('newsDescricao')?.value.trim();
  if (!titulo || !descricao) { showToast('Preencha tÃ­tulo e descriÃ§Ã£o','error'); return; }
  try {
    await adminPost('/admin/noticias', { titulo, descricao, autor, data });
    showToast('NotÃ­cia publicada','info');
    if (event && event.target?.reset) event.target.reset();
    loadNoticiasAdmin();
  } catch(e){ showToast('Erro ao publicar','error'); }
}
async function editNews(id) {
  const titulo = prompt('Novo tÃ­tulo:');
  const descricao = prompt('Nova descriÃ§Ã£o:');
  try {
    await adminPut(`/noticias/${id}`, { titulo, descricao });
    showToast('NotÃ­cia atualizada','info');
    loadNoticiasAdmin();
  } catch(e){ showToast('Erro ao atualizar','error'); }
}
async function deleteNews(id) {
  if (!confirm('Excluir notÃ­cia?')) return;
  try {
    await adminDelete(`/noticias/${id}`);
    showToast('NotÃ­cia excluÃ­da','info');
    loadNoticiasAdmin();
  } catch(e){ showToast('Erro ao excluir','error'); }
}

async function createMod() {
  const nome = prompt('Nome da modalidade:');
  const horario = prompt('Dias/horÃ¡rios:');
  if (!nome) return;
  try {
    await adminPost('/admin/modalidades', { nome, horario });
    showToast('Modalidade criada','info');
    loadModalidadesAdmin();
  } catch(e){ showToast('Erro ao criar modalidade','error'); }
}
async function saveMod(event) {
  if (event) event.preventDefault();
  const nome = document.getElementById('modNome')?.value.trim();
  const horario = document.getElementById('modHorario')?.value.trim();
  if (!nome || !horario) { showToast('Preencha modalidade e horÃ¡rio','error'); return; }
  try {
    await adminPost('/admin/modalidades', { nome, horario });
    showToast('Modalidade salva','info');
    if (event?.target?.reset) event.target.reset();
    loadModalidadesAdmin();
  } catch(e){ showToast('Erro ao salvar modalidade','error'); }
}
async function editMod(id) {
  const nome = prompt('Novo nome:');
  const horario = prompt('Novo horÃ¡rio:');
  try {
    await adminPut(`/admin/modalidades/${id}`, { nome, horario });
    showToast('Modalidade atualizada','info');
    loadModalidadesAdmin();
  } catch(e){ showToast('Erro ao atualizar','error'); }
}
async function deleteMod(id) {
  if (!confirm('Excluir modalidade?')) return;
  try {
    await adminDelete(`/admin/modalidades/${id}`);
    showToast('Modalidade removida','info');
    loadModalidadesAdmin();
  } catch(e){ showToast('Erro ao remover','error'); }
}

// ------------------ BUSCAR ALUNO (admin) ------------------
async function buscarAlunoAdmin() {
  const matricula = document.getElementById('buscaMatricula')?.value.trim();
  const box = document.getElementById('buscaResultado');
  if (!box) return;
  if (!matricula) {
    box.innerHTML = '<p class="muted">Informe a matricula.</p>';
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
            <th>Matricula</th>
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
    box.innerHTML = '<p class="muted">Aluno nao encontrado.</p>';
  }
}

function buscarAluno() {
  return buscarAlunoAdmin();
}

// ------------------ SORTEIO: carregar/horÃ¡rios ------------------
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
      <td><button class="btn-outline btn-sm" onclick="preencherSumulaFromSorteio(${idx})">Sumula</button></td>
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
  if (!jogo) { showToast('Jogo nao encontrado', 'error'); return; }
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
    showToast('Sumula salva','info');
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
  const titulo = `Sumula - ${d.equipeA} x ${d.equipeB}`;
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
        <tr><td colspan="2"><strong>IdentificaÃ§Ã£o do jogo</strong></td></tr>
        <tr><td>Modalidade: ${d.modalidade}</td><td>Fase: ${d.fase}</td></tr>
        <tr><td>Sexo: ${d.sexo}</td><td>Etapa: ${d.etapa}</td></tr>
        <tr><td>Data: ${d.data}</td><td>Inicio: ${d.inicio}  /  Fim: ${d.fim}</td></tr>
        <tr><td>Ãrbitro: ${d.arbitro}</td><td>MesÃ¡rios: ${d.mesarios}</td></tr>
      </table>
      <table>
        <tr><td colspan="4"><strong>Placar</strong></td></tr>
        <tr><td>Equipe A</td><td>${d.equipeA}</td><td>Equipe B</td><td>${d.equipeB}</td></tr>
        <tr><td colspan="2">Pontos A: ${d.pontosA}</td><td colspan="2">Pontos B: ${d.pontosB}</td></tr>
      </table>
      <table>
        <tr><td><strong>CartÃµes</strong></td></tr>
        <tr><td>${d.cartoes || 'â€”'}</td></tr>
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
      showToastErro('Popup bloqueado. Permita popups para ver a prÃ©via.');
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
  if (fase) fase.value = jogo.jogo || 'ClassificatÃ³ria';
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
      <small>Etapa: ${r.etapa} Data: ${r.data || '-'} Ãrbitro: ${r.arbitro || '-'}</small>
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
    showToastErro('NÃ£o hÃ¡ resultados para exportar.');
    return;
  }
  const header = ['Modalidade', 'Fase', 'Sexo', 'Etapa', 'Equipe A', 'Pontos A', 'Equipe B', 'Pontos B', 'Data', 'Ãrbitro'];
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
    : '<p class="muted">Nenhuma pontuaÃ§Ã£o registrada.</p>';
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
        });
      });
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

  renderDrawer();
  ensureSideNavLinks();
  bindDrawerOverlays();
  applyRoleVisibility();
  applyHeroGreeting();
  ensureUserFromApi().then(applyHeroGreeting);
  const avatar = document.getElementById('userAvatar');
  if (avatar) avatar.src = currentUser.foto || '/assets/avatar-default.png';

  if (page === 'admin' && sessionStorage.getItem('adminSessionExpired') === '1') {
    handleAdminSessionExpired('SessÃ£o expirada. FaÃ§a login novamente.');
    return;
  }

  if ((page === 'sumula' || page === 'sumula-mobile') && !isAdminUser()) {
    location.href = 'dashboard.html';
    return;
  }

  if (page === 'admin' && !isStaffUser()) {
    location.href = 'dashboard.html';
    return;
  }

  carregarNoticias();
  carregarModalidades();
  carregarInscricoes();

  if (page === 'perfil') carregarPerfil();
  if (page === 'sumula' || page === 'sumula-mobile') initSumula();
  if (page === 'resultados') renderResultadosLista();
  if (page === 'admin') {
    initSidebarCollapse();
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

  window.addEventListener('resize', () => {
    if (localStorage.getItem('tourActive')) runTourStep();
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
    tbody.innerHTML = '<tr><td colspan="8">Nenhuma inscriÃ§Ã£o encontrada.</td></tr>';
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
  if (!sorteioRows.length) { showToastErro('Gere a tabela antes de aplicar horÃ¡rios'); return; }

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
    showToastSucesso('Horarios aplicados e salvos.');
  } catch (e) {
    showToastErro('Erro ao aplicar horÃ¡rios.');
  }
}

function aplicarHorariosSorteio() {
  return gerarHorariosSorteio();
}

async function carregarTabelaSorteio() {
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

function limparSorteio() {
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

function exportarTabelaSorteioPrint() {
  window.print();
}







