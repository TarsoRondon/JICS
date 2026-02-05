const statusEl = document.getElementById('telaoStatus');
const emAndamentoEl = document.getElementById('emAndamento');
const proximosEl = document.getElementById('proximosJogos');
const ultimosEl = document.getElementById('ultimosJogos');

const params = new URLSearchParams(window.location.search);
const eventoId = params.get('eventoId');

function setStatus(text, ok = true) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = ok ? '#86efac' : '#f87171';
}

function badgeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'finalizado') return 'status-pill status-finalizado';
  if (s === 'em_andamento') return 'status-pill status-em_andamento';
  return 'status-pill status-nao_iniciado';
}

function emptyCard(message) {
  return `
    <div class="telao-card telao-empty">${message}</div>
  `;
}

function cardEmAndamento(jogo) {
  return `
    <div class="telao-card">
      <div class="telao-line">
        <span class="telao-meta">${jogo.modalidade || 'Modalidade'} - ${jogo.chave || ''}</span>
        <span class="${badgeStatus('em_andamento')}">AO VIVO</span>
      </div>
      <div class="telao-scoreboard">
        <span class="telao-team">${jogo.equipe_a}</span>
        <span class="telao-score">${jogo.placar_a ?? 0}</span>
        <span>x</span>
        <span class="telao-score">${jogo.placar_b ?? 0}</span>
        <span class="telao-team" style="text-align:right;">${jogo.equipe_b}</span>
      </div>
      <div class="telao-meta">Jogo ${jogo.jogo_label || '-'}</div>
    </div>
  `;
}

function cardLinha(jogo, status) {
  return `
    <div class="telao-card">
      <div class="telao-line">
        <div>
          <div class="telao-meta">${jogo.modalidade || 'Modalidade'} - ${jogo.chave || ''}</div>
          <strong>${jogo.equipe_a} x ${jogo.equipe_b}</strong>
        </div>
        <div style="text-align:right;">
          <div class="${badgeStatus(status)}">${status}</div>
          <div class="telao-meta">${status === 'FINALIZADO' ? `${jogo.placar_a ?? 0} - ${jogo.placar_b ?? 0}` : (jogo.hora || 'A seguir')}</div>
        </div>
      </div>
    </div>
  `;
}

function renderTelao(data) {
  if (!data) return;
  const emAndamento = data.em_andamento || [];
  const proximos = data.proximos || [];
  const ultimos = data.ultimos || [];

  emAndamentoEl.innerHTML = emAndamento.length
    ? emAndamento.map(cardEmAndamento).join('')
    : emptyCard('Nenhum jogo em andamento no momento.');

  proximosEl.innerHTML = proximos.length
    ? proximos.map(j => cardLinha(j, 'NAO_INICIADO')).join('')
    : emptyCard('Sem proximos jogos.');

  ultimosEl.innerHTML = ultimos.length
    ? ultimos.map(j => cardLinha(j, 'FINALIZADO')).join('')
    : emptyCard('Sem resultados recentes.');
}

async function fetchTelao() {
  if (!eventoId) {
    setStatus('Evento nao informado', false);
    showToast({ type: 'warning', title: 'Evento invalido', message: 'Use ?eventoId=1 na URL.' });
    return;
  }
  try {
    const res = await fetch(`/public/eventos/${eventoId}/telao`);
    const data = await res.json();
    if (!data.sucesso) {
      showToast({ type: 'error', title: 'Erro', message: data?.erro?.mensagem || 'Falha ao carregar.' });
      setStatus('Erro ao carregar', false);
      return;
    }
    renderTelao(data.data);
    setStatus('Conectado');
  } catch {
    setStatus('Offline', false);
    showToast({ type: 'error', title: 'Offline', message: 'Nao foi possivel atualizar o telao.' });
  }
}

const socket = io();
socket.on('connect', () => {
  setStatus('Conectado');
  if (eventoId) socket.emit('join_evento', { eventoId });
});
socket.on('disconnect', () => setStatus('Offline', false));
socket.on('jogos_atualizados', () => fetchTelao());

fetchTelao();
setInterval(fetchTelao, 30000);

