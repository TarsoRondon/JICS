import { api } from '/js/core/api.js';
import { toast } from '/js/ui/toast.js';
import { timeAgo } from '/js/core/timeAgo.js';
import { renderList, renderSkeletonList } from '/js/ui/renderList.js';

const kpiGrid = document.getElementById('kpiGrid');
const feed = document.getElementById('activityFeed');
const lastInscricoes = document.getElementById('lastInscricoes');
const updatedAgo = document.getElementById('updatedAgo');
const btnRefresh = document.getElementById('btnRefresh');
const ctx = document.getElementById('chartModalidades');

let lastUpdate = Date.now();
let chart = null;

function renderKpis(data) {
  const items = [
    { label: 'Alunos', value: data.alunos ?? 0 },
    { label: 'Inscricoes', value: data.inscricoes ?? 0 },
    { label: 'Modalidades', value: data.modalidades ?? 0 },
    { label: 'Pendencias', value: data.pendencias ?? 0 },
    { label: 'Comunicados', value: data.comunicados ?? 0 }
  ];
  kpiGrid.innerHTML = items.map(i => `
    <div class="card">
      <div class="muted">${i.label}</div>
      <div style="font-size:28px;font-weight:900;margin-top:6px">${i.value}</div>
    </div>
  `).join('');
}

function renderFeed(rows) {
  renderList(feed, 'Atividade ao vivo', rows.map(r => ({
    title: r.message,
    subtitle: r.type || 'evento',
    meta: r.createdAt
  })), 'Sem atividade recente.');
}

function renderChart(data) {
  if (!ctx) return;
  const labels = data.labels || [];
  const values = data.values || [];
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Inscricoes',
        data: values,
        backgroundColor: '#00A877'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#8AA0B5' } }, y: { ticks: { color: '#8AA0B5' } } }
    }
  });
}

function renderLastInscricoes(rows) {
  renderList(lastInscricoes, 'Ultimas inscricoes', rows.map(r => ({
    title: r.title,
    subtitle: r.subtitle,
    meta: r.meta
  })), 'Nenhuma inscricao recente.');
}

function updateTimeAgo() {
  const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
  if (updatedAgo) updatedAgo.textContent = `Atualizado ${timeAgo(seconds)}`;
}

async function loadAdminDashboard() {
  renderSkeletonList(feed, 'Atividade ao vivo');
  renderSkeletonList(lastInscricoes, 'Ultimas inscricoes');
  kpiGrid.innerHTML = Array.from({ length: 5 }).map(() => `
    <div class="card">
      <div class="skeleton-line"></div>
      <div class="skeleton-line lg" style="margin-top:10px"></div>
    </div>
  `).join('');

  try {
    const [stats, chartData, activity, ultimas] = await Promise.all([
      api('/dashboard/admin/stats'),
      api('/dashboard/admin/chart'),
      api('/dashboard/admin/activity'),
      api('/dashboard/admin/ultimas-inscricoes')
    ]);
    renderKpis(stats);
    renderChart(chartData);
    renderFeed(activity);
    renderLastInscricoes(ultimas);
    lastUpdate = Date.now();
    updateTimeAgo();
  } catch (err) {
    toast(err.message, 'err');
  }
}

btnRefresh?.addEventListener('click', loadAdminDashboard);
setInterval(() => loadAdminDashboard(), 15000);
setInterval(updateTimeAgo, 1000);
loadAdminDashboard();
