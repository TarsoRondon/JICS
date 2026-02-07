import { api } from '/js/core/api.js';
import { toast } from '/js/ui/toast.js';
import { timeAgo } from '/js/core/timeAgo.js';
import { renderList, renderSkeletonList } from '/js/ui/renderList.js';

const statusText = document.getElementById('statusText');
const chipInscricoes = document.getElementById('chipInscricoes');
const chipAvisos = document.getElementById('chipAvisos');
const nextGames = document.getElementById('nextGames');
const cardInscricoes = document.getElementById('minhasInscricoes');
const cardAvisos = document.getElementById('avisos');
const updatedAgo = document.getElementById('updatedAgo');
const btnRefresh = document.getElementById('btnRefresh');

let lastUpdate = Date.now();

function getMatricula() {
  try {
    const u = JSON.parse(sessionStorage.getItem('usuarioLogado') || '{}');
    return u.matricula || '';
  } catch {
    return '';
  }
}

function updateTimeAgo() {
  const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
  if (updatedAgo) updatedAgo.textContent = `Atualizado ${timeAgo(seconds)}`;
}

async function loadAlunoDashboard() {
  renderSkeletonList(cardInscricoes, 'Minhas inscricoes');
  renderSkeletonList(cardAvisos, 'Avisos');
  if (nextGames) nextGames.innerHTML = '<div class="skeleton-line lg"></div><div class="skeleton-line"></div>';

  try {
    const matricula = getMatricula();
    const [summary, inscricoes, avisos] = await Promise.all([
      api(`/dashboard/aluno/summary?matricula=${encodeURIComponent(matricula)}`),
      api(`/dashboard/aluno/inscricoes?matricula=${encodeURIComponent(matricula)}`),
      api(`/dashboard/aluno/avisos`)
    ]);

    statusText.textContent = summary.status || 'Sem status definido';
    chipInscricoes.textContent = `${summary.inscricoesCount || 0} inscricoes`;
    chipAvisos.textContent = `${summary.avisosCount || 0} avisos`;

    renderList(cardInscricoes, 'Minhas inscricoes', (inscricoes || []).map(i => ({
      title: i.modalidade,
      subtitle: i.status,
      meta: i.updatedAt
    })), 'Voce ainda nao se inscreveu.');

    renderList(cardAvisos, 'Avisos', (avisos || []).map(a => ({
      title: a.title,
      subtitle: a.subtitle
    })), 'Nenhum aviso por enquanto.');

    if (nextGames) {
      const items = (summary.nextGames || []).map(g => `
        <div class="list-item">
          <div class="item-title">${g.title}</div>
          <div class="item-sub">${g.subtitle}</div>
        </div>
      `).join('');
      nextGames.innerHTML = items || '<div class="empty">Sem jogos agendados.</div>';
    }

    lastUpdate = Date.now();
    updateTimeAgo();
  } catch (err) {
    toast(err.message, 'err');
  }
}

btnRefresh?.addEventListener('click', loadAlunoDashboard);
setInterval(() => loadAlunoDashboard(), 20000);
setInterval(updateTimeAgo, 1000);
loadAlunoDashboard();
