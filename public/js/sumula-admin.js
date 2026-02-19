(() => {
  const state = {
    match: null,
    players: { A: [], B: [] },
    cards: [],
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeName(value) {
    return String(value || '')
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeShirt(value) {
    const digits = String(value ?? '').replace(/\D/g, '').trim();
    return digits ? digits.slice(0, 4) : '';
  }

  function normalizePlayer(player) {
    if (typeof player === 'string') {
      const nome = normalizeName(player);
      return nome ? { nome, numero_camisa: '' } : null;
    }
    if (!player || typeof player !== 'object') return null;
    const nome = normalizeName(player.nome || player.player || '');
    if (!nome) return null;
    return {
      nome,
      numero_camisa: normalizeShirt(player.numero_camisa ?? player.shirt ?? player.camisa ?? ''),
    };
  }

  function setMsg(message, type = 'error') {
    const box = byId('sumulaPageMsg');
    if (!box) return;
    if (!message) {
      box.className = 'form-msg';
      box.textContent = '';
      return;
    }
    box.className = 'form-msg show ' + (type === 'success' ? 'success' : 'error');
    box.textContent = message;
  }

  function setCardMsg(message, type = 'error') {
    const box = byId('sumulaPageCardMsg');
    if (!box) return;
    if (!message) {
      box.className = 'form-msg';
      box.textContent = '';
      return;
    }
    box.className = 'form-msg show ' + (type === 'success' ? 'success' : 'error');
    box.textContent = message;
  }

  function updateObsCounter() {
    const obs = byId('sumulaPageObs');
    const counter = byId('sumulaPageObsCounter');
    if (!obs || !counter) return;
    counter.textContent = `${String(obs.value || '').length}/255`;
  }

  function renderPlayersList(side) {
    const container = byId(side === 'A' ? 'sumulaPagePlayersA' : 'sumulaPagePlayersB');
    if (!container) return;
    const players = state.players[side] || [];
    if (!players.length) {
      container.innerHTML = '<div class="sumula-empty">Sem jogadores vinculados.</div>';
      return;
    }
    container.innerHTML = players
      .map((player, index) => {
        const p = normalizePlayer(player);
        if (!p) return '';
        return `
          <div class="sumula-player-item">
            <div class="sumula-player-row">
              <div class="sumula-player-name">${escapeHtml(p.nome)}</div>
              <div class="sumula-player-shirt">
                <label>No camisa</label>
                <input class="sumula-page-player-shirt"
                       data-side="${side}"
                       data-index="${index}"
                       type="text"
                       inputmode="numeric"
                       maxlength="4"
                       value="${escapeHtml(p.numero_camisa || '')}"
                       placeholder="Opcional" />
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll('.sumula-page-player-shirt').forEach((input) => {
      input.addEventListener('input', (event) => {
        const sideRef = String(event.target.dataset.side || 'A').toUpperCase() === 'B' ? 'B' : 'A';
        const idx = Number(event.target.dataset.index || -1);
        if (!Number.isInteger(idx) || idx < 0) return;
        const list = state.players[sideRef] || [];
        const current = normalizePlayer(list[idx]);
        if (!current) return;
        current.numero_camisa = normalizeShirt(event.target.value);
        event.target.value = current.numero_camisa;
        list[idx] = current;
        const selectedTeam = String(byId('sumulaPageCardTeam')?.value || 'A').toUpperCase();
        if (selectedTeam === sideRef) {
          populatePlayerSelect();
        }
      });
    });
  }

  function renderPlayers() {
    renderPlayersList('A');
    renderPlayersList('B');
  }

  function populatePlayerSelect() {
    const team = String(byId('sumulaPageCardTeam')?.value || 'A').toUpperCase();
    const select = byId('sumulaPageCardPlayer');
    if (!select) return;
    const players = (state.players[team] || []).map(normalizePlayer).filter(Boolean);
    select.innerHTML = '<option value="">Jogador</option>' + players
      .map((player) => {
        const label = player.numero_camisa ? `${player.nome} (#${player.numero_camisa})` : player.nome;
        return `<option value="${escapeHtml(player.nome)}" data-camisa="${escapeHtml(player.numero_camisa || '')}">${escapeHtml(label)}</option>`;
      })
      .join('');
    applyShirtFromSelectedPlayer();
  }

  function applyShirtFromSelectedPlayer() {
    const select = byId('sumulaPageCardPlayer');
    const shirt = byId('sumulaPageCardShirt');
    if (!select || !shirt) return;
    const option = select.selectedOptions?.[0];
    shirt.value = normalizeShirt(option?.dataset?.camisa || '');
  }

  function renderCards() {
    const list = byId('sumulaPageCardsList');
    if (!list) return;
    if (!state.cards.length) {
      list.innerHTML = '<div class="sumula-empty">Nenhum cartão lançado.</div>';
      return;
    }
    list.innerHTML = state.cards
      .map((card, index) => {
        const type = String(card.type || 'YELLOW').toUpperCase();
        const badgeClass = type === 'RED' ? 'red' : 'yellow';
        const minute = Number.isInteger(Number(card.minute)) ? `${card.minute}'` : '--';
        const shirt = normalizeShirt(card.shirt || '');
        const team = String(card.team || '').toUpperCase() === 'B' ? 'Equipe B' : 'Equipe A';
        return `
          <div class="sumula-card-item">
            <span class="sumula-card-badge ${badgeClass}">${type === 'RED' ? 'Vermelho' : 'Amarelo'}</span>
            <div>
              <div><strong>${escapeHtml(card.player || '-')}</strong>${shirt ? ` <span class="sumula-card-team">#${escapeHtml(shirt)}</span>` : ''}</div>
              <div class="sumula-card-team">${escapeHtml(team)} - ${escapeHtml(minute)}${card.note ? ` - ${escapeHtml(card.note)}` : ''}</div>
            </div>
            <button class="sumula-card-remove" type="button" data-remove-index="${index}">x</button>
          </div>
        `;
      })
      .join('');

    list.querySelectorAll('[data-remove-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const idx = Number(button.dataset.removeIndex || -1);
        if (!Number.isInteger(idx) || idx < 0) return;
        state.cards.splice(idx, 1);
        renderCards();
      });
    });
  }

  function buildPlayersPayload() {
    const normalizeList = (list) => (list || [])
      .map((player) => normalizePlayer(player))
      .filter(Boolean)
      .map((player) => ({
        nome: player.nome,
        numero_camisa: player.numero_camisa || null,
      }));

    return {
      A: normalizeList(state.players.A),
      B: normalizeList(state.players.B),
    };
  }

  function renderStandings(rows) {
    const body = byId('sumulaPageStandingsBody');
    if (!body) return;
    if (!Array.isArray(rows) || !rows.length) {
      body.innerHTML = '<tr><td colspan="10" class="center muted" style="padding:16px;">Sem dados.</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map((row, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(row.equipe || '-')}</td>
          <td>${Number(row.pontos || 0)}</td>
          <td>${Number(row.jogos || 0)}</td>
          <td>${Number(row.vitorias || 0)}</td>
          <td>${Number(row.empates || 0)}</td>
          <td>${Number(row.derrotas || 0)}</td>
          <td>${Number(row.pro || 0)}</td>
          <td>${Number(row.contra || 0)}</td>
          <td>${Number(row.saldo || 0)}</td>
        </tr>
      `)
      .join('');
  }

  async function loadStandings() {
    if (!state.match?.modalidade_id || !state.match?.sexo || !state.match?.chave) {
      renderStandings([]);
      return;
    }
    try {
      const res = await fetch(
        `/sumulas/tabela?modalidade_id=${state.match.modalidade_id}&sexo=${encodeURIComponent(state.match.sexo)}&chave=${encodeURIComponent(state.match.chave)}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || 'Erro ao carregar classificação.');
      renderStandings(data.standings || []);
      byId('sumulaPageStandingsMeta').textContent = `${state.match.chave || '-'} • ${state.match.sexo || '-'}`;
    } catch (err) {
      renderStandings([]);
      setMsg(err.message || 'Nao foi possivel carregar classificacao.', 'error');
    }
  }

  function fillMatch(match) {
    state.match = match || null;
    byId('sumulaPageTeamA').textContent = normalizeName(match?.equipe_a || '-');
    byId('sumulaPageTeamB').textContent = normalizeName(match?.equipe_b || '-');
    byId('sumulaPageMeta').textContent = `Jogo #${match?.numero_jogo || match?.id || '-'} • ${match?.fase || 'GRUPOS'} • ${match?.chave || '-'}`;
    byId('sumulaPageScoreA').value = match?.placar_a ?? '';
    byId('sumulaPageScoreB').value = match?.placar_b ?? '';
    byId('sumulaPageWo').checked = Boolean(match?.wo);
    byId('sumulaPageObs').value = match?.observacoes || '';
    byId('sumulaPageArbitro').value = normalizeName(match?.arbitro_nome || '');
    byId('sumulaPageMesario').value = normalizeName(match?.mesario_nome || '');
    updateObsCounter();
  }

  async function loadDetails() {
    const matchId = Number(byId('sumulaPageMatchId')?.value || 0);
    if (!matchId) {
      setMsg('Informe o ID do jogo.', 'error');
      return;
    }
    setMsg('Carregando...', 'success');
    try {
      const res = await fetch(`/sumulas/jogos/${matchId}/detalhes`, { credentials: 'include' });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || 'Erro ao carregar detalhes.');

      fillMatch(data.match);
      state.players = {
        A: (data.jogadoresA || []).map((player) => normalizePlayer(player)).filter(Boolean),
        B: (data.jogadoresB || []).map((player) => normalizePlayer(player)).filter(Boolean),
      };
      state.cards = Array.isArray(data.cartoes)
        ? data.cartoes.map((card) => ({
            team: String(card.team || '').toUpperCase() === 'B' ? 'B' : 'A',
            player: normalizeName(card.player || ''),
            shirt: normalizeShirt(card.shirt || card.numero_camisa || ''),
            type: String(card.type || '').toUpperCase() === 'RED' ? 'RED' : 'YELLOW',
            minute: Number.isInteger(Number(card.minute)) ? Number(card.minute) : null,
            note: normalizeName(card.note || ''),
          })).filter((card) => card.player)
        : [];

      renderPlayers();
      populatePlayerSelect();
      renderCards();
      await loadStandings();
      setMsg('Detalhes carregados.', 'success');
    } catch (err) {
      setMsg(err.message || 'Falha ao carregar detalhes.', 'error');
    }
  }

  function addCard() {
    const team = String(byId('sumulaPageCardTeam')?.value || 'A').toUpperCase();
    const player = normalizeName(byId('sumulaPageCardPlayer')?.value || '');
    const shirt = normalizeShirt(byId('sumulaPageCardShirt')?.value || '');
    const type = String(byId('sumulaPageCardType')?.value || 'YELLOW').toUpperCase();
    const minuteRaw = String(byId('sumulaPageCardMinute')?.value || '').trim();
    const note = normalizeName(byId('sumulaPageCardNote')?.value || '');

    if (!['A', 'B'].includes(team)) {
      setCardMsg('Selecione uma equipe.', 'error');
      return;
    }
    if (!player) {
      setCardMsg('Selecione um jogador.', 'error');
      return;
    }
    if (!['YELLOW', 'RED'].includes(type)) {
      setCardMsg('Tipo de cartão inválido.', 'error');
      return;
    }

    let minute = null;
    if (minuteRaw !== '') {
      const minuteNum = Number(minuteRaw);
      if (!Number.isInteger(minuteNum) || minuteNum < 0) {
        setCardMsg('Minuto inválido.', 'error');
        return;
      }
      minute = minuteNum;
    }

    state.cards.push({
      team,
      player,
      shirt: shirt || null,
      type,
      minute,
      note: note.slice(0, 120),
    });

    byId('sumulaPageCardMinute').value = '';
    byId('sumulaPageCardNote').value = '';
    byId('sumulaPageCardShirt').value = '';
    renderCards();
    setCardMsg('Cartão adicionado.', 'success');
  }

  async function saveSumula() {
    if (!state.match?.id) {
      setMsg('Carregue um jogo antes de salvar.', 'error');
      return;
    }

    const scoreA = byId('sumulaPageScoreA');
    const scoreB = byId('sumulaPageScoreB');
    const wo = byId('sumulaPageWo');

    const payload = {
      placar_a: scoreA?.value ?? null,
      placar_b: scoreB?.value ?? null,
      wo: Boolean(wo?.checked),
      observacoes: byId('sumulaPageObs')?.value || '',
      arbitro_nome: normalizeName(byId('sumulaPageArbitro')?.value || ''),
      mesario_nome: normalizeName(byId('sumulaPageMesario')?.value || ''),
      cartoes: state.cards,
      jogadores: buildPlayersPayload(),
    };

    const invalid = !payload.wo && (payload.placar_a === '' || payload.placar_b === '' || payload.placar_a === null || payload.placar_b === null);
    scoreA?.classList.toggle('input-erro', invalid);
    scoreB?.classList.toggle('input-erro', invalid);
    if (invalid) {
      setMsg('Informe placar válido.', 'error');
      return;
    }

    const saveBtn = byId('sumulaPageSaveBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Salvando...';
    }

    try {
      const res = await fetch(`/sumulas/jogos/${state.match.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || 'Erro ao salvar súmula.');

      state.match = { ...(state.match || {}), ...(data.match || {}) };
      fillMatch(state.match);
      if (Array.isArray(data.standings)) {
        renderStandings(data.standings);
      } else {
        await loadStandings();
      }

      if (window.SuccessFeedback?.show) {
        window.SuccessFeedback.show({
          title: 'Súmula salva',
          message: 'Atualização concluída com sucesso.',
          duration: 2200,
        });
      }
      setMsg('Súmula salva com sucesso.', 'success');
    } catch (err) {
      setMsg(err.message || 'Falha ao salvar súmula.', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar súmula';
      }
    }
  }

  function bindEvents() {
    byId('sumulaPageLoadBtn')?.addEventListener('click', loadDetails);
    byId('sumulaPageSaveBtn')?.addEventListener('click', saveSumula);
    byId('sumulaPageAddCardBtn')?.addEventListener('click', addCard);
    byId('sumulaPageCardTeam')?.addEventListener('change', populatePlayerSelect);
    byId('sumulaPageCardPlayer')?.addEventListener('change', applyShirtFromSelectedPlayer);
    byId('sumulaPageCardShirt')?.addEventListener('input', () => {
      const input = byId('sumulaPageCardShirt');
      if (!input) return;
      input.value = normalizeShirt(input.value);
    });
    byId('sumulaPageObs')?.addEventListener('input', updateObsCounter);
    byId('sumulaPageWo')?.addEventListener('change', () => {
      const checked = Boolean(byId('sumulaPageWo')?.checked);
      const scoreA = byId('sumulaPageScoreA');
      const scoreB = byId('sumulaPageScoreB');
      if (scoreA) {
        scoreA.disabled = checked;
        if (checked) scoreA.value = '';
      }
      if (scoreB) {
        scoreB.disabled = checked;
        if (checked) scoreB.value = '';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    updateObsCounter();
    const jogo = Number(new URLSearchParams(window.location.search).get('jogo') || 0);
    if (jogo) {
      byId('sumulaPageMatchId').value = String(jogo);
      loadDetails();
    }
  });
})();
