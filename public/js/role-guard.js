// Role Guard - Protege acesso ao admin/aluno dashboard
(async() => {
    // Aguarda DOM e outros scripts
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGuard);
    } else {
        setTimeout(initGuard, 100);
    }

    async function initGuard() {
        try {
            // Pega user do sessionStorage primeiro (fallback login)
            let user = null;
            try {
                const saved = sessionStorage.getItem('usuarioLogado');
                if (saved) user = JSON.parse(saved);
            } catch {}

            // Usa API para role definitiva
            const res = await fetch('/api/user/role', { credentials: 'include' });
            const roleData = await res.json();

            if (!res.ok || !roleData.sucesso || !roleData.role) {
                // Não logado -> index
                if (location.pathname.includes('admin.html') ||
                    location.pathname.includes('aluno/') ||
                    location.pathname.includes('dashboard')) {
                    location.href = '/index.html';
                }
                return;
            }

            const role = roleData.role.toUpperCase();
            const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'STAFF';
            const path = location.pathname.toLowerCase();

            // Admin page mas não é admin -> manda para aluno dashboard
            const isAdminPage = path.startsWith('/admin') || path.includes('admin.html') || path.includes('painel-sorteio') || path.includes('sumula.html') || path.includes('logs.html');
            if (isAdminPage && !isAdmin) {
                location.href = '/aluno/dashboard.html';
                return;
            }

            // Salva no sessionStorage
            user = { ...(user || {}), ...(roleData.user || {}), role };
            sessionStorage.setItem('usuarioLogado', JSON.stringify(user));

            console.log('[Role Guard] Role:', role, 'Page OK');
        } catch (err) {
            console.error('[Role Guard] Error:', err);
            if (location.pathname.includes('admin')) {
                location.href = '/index.html';
            }
        }
    }
})();