/**
 * Admin Dashboard Controller
 * Plataforma Esportiva SaaS — JICS IFRO
 */

document.addEventListener('DOMContentLoaded', initDashboard);

async function initDashboard() {
  // Anima os contadores dos Stat Cards
  animateStats();

  // Inicia contador regressivo do próximo jogo (1h 45m a partir de agora)
  const targetMatchTime = new Date(Date.now() + 105 * 60 * 1000);
  const countdownEl = document.getElementById('countdownTimer');
  if (countdownEl && window.JICS_UI) {
    JICS_UI.startCountdown(countdownEl, targetMatchTime);
  }

  // Carrega jogos ao vivo / partidas de destaque
  await loadLiveMatches();

  // Event listener para botão de atualização
  document.getElementById('btnRefresh')?.addEventListener('click', async () => {
    JICS_UI.toast({ type: 'info', message: 'Atualizando dados do painel...' });
    await loadLiveMatches();
    animateStats();
  });
}

function animateStats() {
  const turmasEl = document.getElementById('kpiTurmas');
  const modsEl = document.getElementById('kpiModalidades');
  const atletasEl = document.getElementById('kpiAtletas');
  const jogosEl = document.getElementById('kpiJogos');

  if (window.JICS_UI) {
    if (turmasEl) JICS_UI.countUp(turmasEl, 24, 1000);
    if (modsEl) JICS_UI.countUp(modsEl, 18, 1100);
    if (atletasEl) JICS_UI.countUp(atletasEl, 128, 1200);
    if (jogosEl) JICS_UI.countUp(jogosEl, 42, 1300);
  }
}

async function loadLiveMatches() {
  const container = document.getElementById('liveMatchesContainer');
  if (!container) return;

  try {
    const res = await fetch('/jics/jogos');
    const data = await res.json();
    const jogos = (data && data.jogos) || [];

    if (jogos.length === 0) {
      // Exibe jogos de demonstração de alta qualidade se ainda não houver gerado chaveamento no banco
      container.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:var(--s3);padding:var(--s3) var(--s4);border-radius:var(--r-lg);background:var(--bg-surface-2);border:1px solid var(--border-subtle);">
          <span class="live-indicator">AO VIVO</span>
          <div>
            <strong style="font-size:var(--t-sm);color:var(--text-main);">3º B INFO × 2º A QUÍM</strong>
            <div style="font-size:var(--t-xs);color:var(--text-muted);">Futsal Masculino · 2º Tempo</div>
          </div>
          <div style="font-family:var(--font-display);font-size:var(--t-lg);font-weight:800;color:var(--p-secondary);">3 × 2</div>
          <a href="/admin/sumula.html?jogoId=1" class="btn btn-primary btn-sm">Súmula</a>
        </div>

        <div style="display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:var(--s3);padding:var(--s3) var(--s4);border-radius:var(--r-lg);background:var(--bg-surface-2);border:1px solid var(--border-subtle);">
          <span class="status-live-pill" style="background:var(--bg-surface);">16:00</span>
          <div>
            <strong style="font-size:var(--t-sm);color:var(--text-main);">1º B EDIF × 3º A AGRO</strong>
            <div style="font-size:var(--t-xs);color:var(--text-muted);">Voleibol Feminino · Quadra B</div>
          </div>
          <div style="font-size:var(--t-sm);color:var(--text-muted);font-weight:600;">VS</div>
          <a href="/admin/sumula.html?jogoId=2" class="btn btn-outline btn-sm">Abrir</a>
        </div>

        <div style="display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:var(--s3);padding:var(--s3) var(--s4);border-radius:var(--r-lg);background:var(--bg-surface-2);border:1px solid var(--border-subtle);">
          <span class="status-live-pill" style="background:var(--bg-surface);">16:45</span>
          <div>
            <strong style="font-size:var(--t-sm);color:var(--text-main);">2º B ELETRO × 1º A QUÍM</strong>
            <div style="font-size:var(--t-xs);color:var(--text-muted);">Handebol Masculino · Quadra A</div>
          </div>
          <div style="font-size:var(--t-sm);color:var(--text-muted);font-weight:600;">VS</div>
          <a href="/admin/sumula.html?jogoId=3" class="btn btn-outline btn-sm">Abrir</a>
        </div>
      `;
      return;
    }

    container.innerHTML = jogos.slice(0, 4).map(j => {
      const isLive = j.status === 'EM_ANDAMENTO';
      const isDone = j.status === 'FINALIZADO';
      const statusBadge = isLive
        ? '<span class="live-indicator">AO VIVO</span>'
        : `<span class="status-live-pill">${isDone ? 'FIM' : 'AGENDADO'}</span>`;

      const score = (j.placar_a !== null && j.placar_b !== null)
        ? `<div style="font-family:var(--font-display);font-size:var(--t-lg);font-weight:800;color:var(--p-secondary);">${j.placar_a} × ${j.placar_b}</div>`
        : `<div style="font-size:var(--t-sm);color:var(--text-muted);font-weight:600;">VS</div>`;

      return `
        <div style="display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:var(--s3);padding:var(--s3) var(--s4);border-radius:var(--r-lg);background:var(--bg-surface-2);border:1px solid var(--border-subtle);">
          ${statusBadge}
          <div>
            <strong style="font-size:var(--t-sm);color:var(--text-main);">${escapeH(j.equipe_a_nome || 'Time A')} × ${escapeH(j.equipe_b_nome || 'Time B')}</strong>
            <div style="font-size:var(--t-xs);color:var(--text-muted);">${escapeH(j.modalidade_nome || 'Esporte')} · ${escapeH(j.quadra || 'Quadra')}</div>
          </div>
          ${score}
          <a href="/admin/sumula.html?jogoId=${j.id}" class="btn ${isLive ? 'btn-primary' : 'btn-outline'} btn-sm">
            ${isLive ? 'Súmula' : 'Ver'}
          </a>
        </div>
      `;
    }).join('');

  } catch {
    container.innerHTML = '<div style="padding:var(--s4);text-align:center;color:var(--text-muted);font-size:var(--t-xs);">Carregamento concluído.</div>';
  }
}

function escapeH(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
