(function () {
  function isAdminContext() {
    if (!document.body) return false;

    var page = String(document.body.getAttribute('data-page') || '').toLowerCase();
    if (page === 'admin' || page === 'painel-sorteio' || page === 'sumula' || page === 'sumula-mobile' || page === 'sorteios-salvos') {
      return true;
    }

    if (document.body.classList.contains('admin-ui') || document.body.classList.contains('admin-theme')) {
      return true;
    }

    var path = (window.location && window.location.pathname ? window.location.pathname : '').toLowerCase();
    var adminPathPatterns = [
      /\/admin\.html$/,
      /\/admin-cadastro\.html$/,
      /\/admin\/dashboard\.html$/,
      /\/painel-sorteio\.html$/,
      /\/sorteios-salvos\.html$/,
      /\/sumula\.html$/,
      /\/sumula-mobile\.html$/
    ];
    return adminPathPatterns.some(function (pattern) { return pattern.test(path); });
  }

  function readSessionUser() {
    try {
      var raw = sessionStorage.getItem('usuarioLogado');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function getDisplayName() {
    var user = readSessionUser();
    if (!user) return 'ADMIN003_';
    var base = user.nome || user.matricula || user.usuario || '';
    if (!base) return 'ADMIN003_';
    return String(base).trim();
  }

  function getAvatarSrc() {
    var user = readSessionUser();
    return user && user.foto ? String(user.foto) : '/assets/avatar-default.png';
  }

  function buildGlobalNav() {
    var nav = document.createElement('nav');
    nav.className = 'global-site-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Navegacao global');
    nav.innerHTML = [
      '<div class="navbar-left">',
      '  <button class="navbar-brand global-nav-brand" type="button">IFRO ESPORTES - ADMIN</button>',
      '</div>',
      '<div class="navbar-right">',
      '  <button class="icon-btn global-nav-settings" type="button" aria-label="Configuracoes">',
      '    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">',
      '      <path fill="currentColor" d="M19.14,12.94a7.43,7.43,0,0,0,.05-.94,7.43,7.43,0,0,0-.05-.94l2.11-1.65a.5.5,0,0,0,.12-.64l-2-3.46a.5.5,0,0,0-.6-.22l-2.49,1a7.06,7.06,0,0,0-1.63-.94l-.38-2.65A.5.5,0,0,0,13.78,2H10.22a.5.5,0,0,0-.49.41L9.35,5.06a7.06,7.06,0,0,0-1.63.94l-2.49-1a.5.5,0,0,0-.6.22l-2,3.46a.5.5,0,0,0,.12.64L4.86,11.06a7.43,7.43,0,0,0-.05.94,7.43,7.43,0,0,0,.05.94L2.75,14.59a.5.5,0,0,0-.12.64l2,3.46a.5.5,0,0,0,.6.22l2.49-1a7.06,7.06,0,0,0,1.63.94l.38,2.65a.5.5,0,0,0,.49.41h3.56a.5.5,0,0,0,.49-.41l.38-2.65a7.06,7.06,0,0,0,1.63-.94l2.49,1a.5.5,0,0,0,.6-.22l2-3.46a.5.5,0,0,0-.12-.64ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z" />',
      '    </svg>',
      '  </button>',
      '  <div class="user-menu">',
      '    <button class="user-trigger global-nav-user" type="button" aria-label="Perfil">',
      '      <span class="user-name global-nav-user-name"></span>',
      '      <img class="user-avatar global-nav-avatar" src="/assets/avatar-default.png" alt="Avatar">',
      '    </button>',
      '  </div>',
      '</div>'
    ].join('');
    return nav;
  }

  function bindGlobalNav(nav) {
    if (!nav) return;

    var brand = nav.querySelector('.global-nav-brand');
    var settings = nav.querySelector('.global-nav-settings');
    var userBtn = nav.querySelector('.global-nav-user');
    var userName = nav.querySelector('.global-nav-user-name');
    var avatar = nav.querySelector('.global-nav-avatar');

    if (userName) userName.textContent = getDisplayName();
    if (avatar) {
      avatar.src = getAvatarSrc();
      avatar.onerror = function () { this.src = '/assets/avatar-default.png'; };
    }

    if (brand && !brand.dataset.bound) {
      brand.dataset.bound = '1';
      brand.addEventListener('click', function () {
        window.location.href = '/admin.html';
      });
    }

    if (settings && !settings.dataset.bound) {
      settings.dataset.bound = '1';
      settings.addEventListener('click', function (event) {
        if (typeof window.toggleAdminMenu === 'function') {
          window.toggleAdminMenu(event);
          return;
        }
        window.location.href = '/admin.html';
      });
    }

    if (userBtn && !userBtn.dataset.bound) {
      userBtn.dataset.bound = '1';
      userBtn.addEventListener('click', function () {
        if (typeof window.toggleUserDrawer === 'function') {
          window.toggleUserDrawer();
          return;
        }
        window.location.href = '/perfil.html';
      });
    }
  }

  function ensureGlobalNav() {
    if (!document.body) return;
    if (document.body.hasAttribute('data-no-global-nav')) return;
    if (!isAdminContext()) return;

    var global = document.querySelector('.global-site-nav');
    if (global) {
      bindGlobalNav(global);
      return;
    }

    var nav = buildGlobalNav();

    var firstNavbar = document.querySelector('nav.navbar');
    if (firstNavbar) {
      firstNavbar.replaceWith(nav);
      bindGlobalNav(nav);
      return;
    }

    var root = document.getElementById('appShell');
    if (root) {
      root.insertBefore(nav, root.firstChild || null);
      bindGlobalNav(nav);
      return;
    }

    var firstChild = document.body.firstElementChild;
    if (firstChild) {
      document.body.insertBefore(nav, firstChild);
    } else {
      document.body.appendChild(nav);
    }
    bindGlobalNav(nav);
  }

  function shouldSkipAutoDarkTheme() {
    if (!document.body) return true;
    var path = (window.location && window.location.pathname ? window.location.pathname : '').toLowerCase();
    return path === '/' || path.endsWith('/index.html') || document.body.hasAttribute('data-preserve-theme');
  }

  function ensureDarkTheme() {
    if (!document.body) return;
    if (shouldSkipAutoDarkTheme()) return;
    if (!document.body.getAttribute('data-theme')) {
      document.body.setAttribute('data-theme', 'dark');
    }
  }

  function buildFooter() {
    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = [
      '<div class="footer-left">',
      '  <span>&copy; 2015</span>',
      '  <a href="https://gesstec.org/" target="_blank" rel="noopener">GESSTEC - IFRO</a>',
      '  <span>Todos os direitos reservados.</span>',
      '</div>',
      '<div class="footer-right">',
      '  &copy; 2026 IFRO ESPORTES',
      '  <span>Sistema institucional</span>',
      '</div>'
    ].join('');
    return footer;
  }

  function ensureFooter() {
    if (!document.body) return;
    if (document.querySelector('.site-footer') || document.querySelector('.global-site-footer')) return;

    var root = document.getElementById('appShell') || document.body;
    var anchor = root.querySelector('#sideOverlay') || root.querySelector('#drawerOverlay');
    if (anchor && anchor.parentElement === root) {
      root.insertBefore(buildFooter(), anchor);
      return;
    }
    root.appendChild(buildFooter());
  }

  function init() {
    ensureDarkTheme();
    ensureGlobalNav();
    ensureFooter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
