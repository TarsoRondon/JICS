// Aluno Dashboard JS - Completo e Funcional
// Integra com jsdosistema.js existente

document.addEventListener('DOMContentLoaded', initAlunoDashboard);

async function initAlunoDashboard() {
    showLoading(true);

    try {
        await loadUserFromStorage();

        if (!currentUser || normalizeRole(currentUser.role) !== 'ALUNO') {
            location.href = '/index.html';
            return;
        }

        await Promise.all([
            carregarDashboardData(),
            carregarProximoJogo(),
            carregarProximosJogos(),
            carregarInscricoesMinhas(),
            carregarAvisosRecentes(),
            carregarResultadosRecentes(),
            carregarClassificacao(),
            carregarCalendario()
        ]);

        setupEventListeners();
        updateLastUpdated();

    } catch (error) {
        console.error(error);
        showToastErro('Erro ao carregar dashboard');
    }

    showLoading(false);
}

function setupUserProfile() {
    const avatar = document.getElementById('profileAvatar');
    const dropdownAvatar = document.getElementById('dropdownAvatar');
    const profileName = document.getElementById('profileName');
    const dropdownName = document.getElementById('dropdownName');
    const dropdownMatricula = document.getElementById('dropdownMatricula');

    if (avatar) avatar.src = currentUser.foto || '/assets/avatar-default.png';
    if (dropdownAvatar) dropdownAvatar.src = currentUser.foto || '/assets/avatar-default.png';
    if (profileName) profileName.textContent = currentUser.nome || 'Aluno';
    if (dropdownName) dropdownName.textContent = currentUser.nome || 'Aluno';
    if (dropdownMatricula) dropdownMatricula.textContent = currentUser.matricula || '';

    // Aplicar animação de nome
    animateUserName(currentUser.nome || '');
}

async function carregarDashboardData() {
    try {
        // Stats principais
        const stats = await fetch('/api/aluno/stats', { credentials: 'include' });
        const statsData = await stats.json();

        document.getElementById('totalInscricoes').textContent = statsData.inscricoes || 0;
        document.getElementById('totalModalidades').textContent = statsData.modalidades || 0;
        document.getElementById('totalNoticias').textContent = statsData.noticias || 0;

        // Badge status
        const badge = document.getElementById('statusInscricoes');
        if (statsData.inscricoes > 0) {
            badge.textContent = `${statsData.inscricoes} inscrições`;
            badge.className = 'badge blue';
        } else {
            badge.textContent = 'Sem inscrições';
            badge.className = 'badge yellow';
        }

        // Status geral
        const statusBadge = document.getElementById('statusBadge');
        if (statsData.inscricoes > 0) {
            statusBadge.textContent = 'Ativo';
            statusBadge.className = 'status-badge active';
        } else {
            statusBadge.textContent = 'Aguardando';
            statusBadge.className = 'status-badge pending';
        }

    } catch (error) {
        console.error('Erro stats:', error);
    }
}

async function carregarClassificacao() {
    try {
        const response = await fetch('/api/classificacao');
        const tabela = await response.json();

        const container = document.getElementById('classificacao');

        container.innerHTML = `
            <table class="tabela">
                <tr>
                    <th>Pos</th>
                    <th>Equipe</th>
                    <th>Pts</th>
                </tr>
                ${tabela.map((time, i) => `
                    <tr>
                        <td>${i+1}</td>
                        <td>${time.equipe}</td>
                        <td>${time.pontos}</td>
                    </tr>
                `).join('')}
            </table>
        `;

    } catch (error) {
        console.error(error);
    }
}

async function carregarCalendario() {
    try {
        const response = await fetch('/api/calendario');
        const jogos = await response.json();

        const container = document.getElementById('calendarioJogos');

        container.innerHTML = jogos.map(jogo => `
            <div class="calendario-item">
                ${formatDateBr(jogo.data)} - ${jogo.modalidade}
            </div>
        `).join('');

    } catch (error) {
        console.error(error);
    }
}

async function carregarInscricoesMinhas() {
    try {
        const response = await fetch('/inscricoes/jics?aluno_id=' + currentUser.id, {
            credentials: 'include'
        });
        const inscricoes = await response.json();

        const container = document.getElementById('minhasInscricoes');
        const emptyState = document.getElementById('semInscricoes');

        if (!inscricoes || inscricoes.length === 0) {
            container.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.style.display = 'grid';

        // Filtrar inscrições únicas por modalidade
        const unicas = [];
        const vistos = new Set();
        inscricoes.forEach(insc => {
            const key = `${insc.modalidade}-${insc.tipo}`;
            if (!vistos.has(key)) {
                vistos.add(key);
                unicas.push(insc);
            }
        });

        container.innerHTML = unicas.slice(0, 4).map(insc => `
            <div class="inscricao-card" onclick="window.location.href='/inscricoes.html'">
                <div class="card-header">
                    <h4>${escapeHtml(insc.modalidade || 'Modalidade')}</h4>
                    <span class="status-dot ${getStatusColor(insc.status || 'pendente')}"></span>
                </div>
                <div class="card-content">
                    <div class="meta-row">
                        <span class="meta-label">Tipo:</span>
                        <span>${insc.tipo || 'Normal'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Data:</span>
                        <span>${formatDateBr(insc.data) || 'A definir'}</span>
                    </div>
                    ${insc.horario ? `<div class="meta-row">
                        <span class="meta-label">Horário:</span>
                        <span>${insc.horario}</span>
                    </div>` : ''}
                </div>
                <div class="card-footer">
                    <span>Detalhes</span>
                    <span class="material-icons">chevron_right</span>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Erro inscrições:', error);
        showToastErro('Erro ao carregar inscrições');
    }
}

async function carregarProximoJogo() {
    try {
        const response = await fetch('/api/aluno/proximo-jogo?aluno_id=' + currentUser.id);
        const jogo = await response.json();

        const container = document.getElementById('proximoJogo');

        if (!jogo) {
            container.innerHTML = 'Nenhum jogo marcado';
            return;
        }

        container.innerHTML = `
            <strong>${jogo.modalidade}</strong>
            <p>${jogo.equipeA} x ${jogo.equipeB}</p>
            <p>${formatDateBr(jogo.data)} - ${jogo.hora}</p>
            <p>${jogo.local || ''}</p>
        `;
    } catch (error) {
        console.error(error);
    }
}

async function carregarAvisosRecentes() {
    try {
        const response = await fetch('/noticias?limite=5', { credentials: 'include' });
        const noticias = await response.json();
        
        const container = document.getElementById('avisosRecentes');
        const emptyState = document.getElementById('semAvisos');
        
        if (!noticias || noticias.length === 0) {
            container.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        container.style.display = 'block';
        
        container.innerHTML = noticias.slice(0, 4).map(noticia => `
            <div class="aviso-card">
                <div class="card-header">
                    <h4>${truncateText(noticia.titulo, 60)}</h4>
                    <span class="material-icons">access_time</span>
                </div>
                <p>${truncateText(noticia.descricao, 140)}</p>
                <div class="card-footer">
                    <small>${formatDateBr(noticia.data_publicacao)}</small>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Erro avisos:', error);
    }
}

async function carregarResultadosRecentes() {
    try {
        const response = await fetch('/api/resultados/recentes');
        const jogos = await response.json();

        const container = document.getElementById('resultadosRecentes');

        container.innerHTML = jogos.slice(0,5).map(jogo => `
            <div class="resultado-item">
                ${jogo.equipeA} ${jogo.placarA} x ${jogo.placarB} ${jogo.equipeB}
            </div>
        `).join('');

    } catch (error) {
        console.error(error);
    }
}

function setupEventListeners() {
    document.getElementById('btnRefresh')
        .addEventListener('click', initAlunoDashboard);

    // Menu toggle
    document.querySelector('.menu-toggle').addEventListener('click', toggleMenu);
    
    // User menu toggle
    document.querySelector('.user-profile').addEventListener('click', toggleUserMenu);
    
    // Overlay close
    document.getElementById('overlay').addEventListener('click', closeMenus);
    
    // Close menus on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenus();
    });
    
    // Refresh button
    document.getElementById('btnRefresh').addEventListener('click', refreshDashboard);
}
function formatDateBr(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR');
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.toggle('active', show);
}

function logout() {
    sessionStorage.clear();
    location.href = '/index.html';
}

function toggleMenu() {
    const menu = document.getElementById('sideMenu');
    const overlay = document.getElementById('overlay');
    menu.classList.toggle('active');
    overlay.classList.toggle('active');
}

function toggleUserMenu() {
    const dropdown = document.getElementById('userMenu');
    dropdown.classList.toggle('active');
}

function closeMenus() {
    document.getElementById('sideMenu').classList.remove('active');
    document.getElementById('userMenu').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
    document.getElementById('helpModal').classList.add('hidden');
}

function showHelp() {
    document.getElementById('helpModal').classList.remove('hidden');
    document.getElementById('overlay').classList.add('active');
}

function hideHelp() {
    document.getElementById('helpModal').classList.add('hidden');
    document.getElementById('overlay').classList.remove('active');
}

async function refreshDashboard() {
    const btn = document.getElementById('btnRefresh');
    const icon = btn.querySelector('.material-icons');
    
    btn.classList.add('spinning');
    icon.textContent = 'refresh';
    
    await initAlunoDashboard();
    
    btn.classList.remove('spinning');
}

function updateLastUpdated() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    document.getElementById('updatedAgo').textContent = `Atualizado às ${timeStr}`;
}

// Utilitários
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '<',
        '>': '>',
        '"': '"',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function truncateText(text, max) {
    return text.length > max ? text.slice(0, max) + '...' : text;
}

function formatDateBr(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

function getStatusColor(status) {
    const colors = {
        'ativo': 'green',
        'confirmado': 'green',
        'pendente': 'orange',
        'cancelado': 'red',
        'finalizado': 'green'
    };
    return colors[status?.toLowerCase()] || 'orange';
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.toggle('active', show);
}

function showToastErro(msg) {
    showToast(msg, 'error');
}

function showToastSucesso(msg) {
    showToast(msg, 'success');
}

function showToast(msg, type = 'info') {
    if (typeof showToastErro === 'function') {
        showToastErro(msg);
        return;
    }
    
    // Fallback toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-message">${escapeHtml(msg)}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        </div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// Logout
function logout() {
    if (confirm('Deseja realmente sair?')) {
        sessionStorage.clear();
        location.href = '/index.html';
    }
}

// Polyfill para funções do jsdosistema.js
if (typeof normalizeRole !== 'function') {
    window.normalizeRole = (role) => {
        const value = String(role || '').toUpperCase();
        if (value.includes('ADMIN')) return 'ADMIN';
        if (value.includes('PROFESSOR')) return 'PROFESSOR';
        return 'ALUNO';
    };
}

if (typeof animateUserName !== 'function') {
    window.animateUserName = (text) => {
        const el = document.getElementById('userNameNavbar') || 
                   document.querySelector('.user-name') ||
                   document.getElementById('profileName');
        if (!el) return;
        
        const safeText = String(text || '').trim();
        el.textContent = safeText;
    };
}

if (typeof showGlobalLoading !== 'function') {
    window.showGlobalLoading = (show) => {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.toggle('active', show);
    };
}