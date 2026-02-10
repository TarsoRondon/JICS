(() => {
  function renderBarChart(targetId, labels, values) {
    const target = document.getElementById(targetId);
    if (!target) return;
    if (!labels.length) {
      target.innerHTML = '<div class="muted">Sem dados suficientes.</div>';
      return;
    }
    const max = Math.max(...values, 1);
    target.innerHTML = labels.map((label, idx) => {
      const value = values[idx];
      const pct = Math.round((value / max) * 100);
      return `
        <div class="bar-row">
          <div class="bar-label">${label}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="bar-value">${value}</div>
        </div>
      `;
    }).join('');
  }

  function normalizeText(value, fallback = 'Não informado') {
    const text = String(value || '').trim();
    return text || fallback;
  }

  function extractSerie(turma) {
    const text = String(turma || '').toUpperCase();
    const match = text.match(/(\d)\s*(?:º|O)/);
    if (match) return `${match[1]}º ano`;
    return 'Não informado';
  }

  function countByCategory(rows, keyFn, uniqueField = 'matricula') {
    const map = new Map();
    rows.forEach((row) => {
      const label = normalizeText(keyFn(row));
      if (!map.has(label)) map.set(label, new Set());
      const set = map.get(label);
      const id = row?.[uniqueField] || JSON.stringify(row);
      set.add(id);
    });
    return Array.from(map.entries()).map(([label, set]) => ({ label, value: set.size }));
  }

  function countByTotal(rows, keyFn) {
    const map = new Map();
    rows.forEach((row) => {
      const label = normalizeText(keyFn(row));
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }

  function topItems(list, limit = 8) {
    return list
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  async function loadAdminAnalytics() {
    if (document.body.dataset.page !== 'admin') return;
    if (window.__adminSessionExpired) return;
    let rows = [];
    try {
      const res = await fetch('/api/inscricoes', { credentials: 'include' });
      rows = await res.json();
      if (!Array.isArray(rows)) rows = [];
    } catch (_) {
      rows = [];
    }

    const porTurma = topItems(countByCategory(rows, r => r.turma), 8);
    const porCurso = topItems(countByCategory(rows, r => r.curso), 8);
    const porSerie = topItems(countByCategory(rows, r => extractSerie(r.turma)), 6);
    const porModalidade = topItems(countByTotal(rows, r => r.modalidade), 5);

    renderBarChart('chartTurmas', porTurma.map(i => i.label), porTurma.map(i => i.value));
    renderBarChart('chartCursos', porCurso.map(i => i.label), porCurso.map(i => i.value));
    renderBarChart('chartSeries', porSerie.map(i => i.label), porSerie.map(i => i.value));
    renderBarChart('chartModalidadesAdmin', porModalidade.map(i => i.label), porModalidade.map(i => i.value));

    const resumo = document.getElementById('modalidadeTopResumo');
    if (resumo) {
      if (!porModalidade.length) {
        resumo.textContent = 'Sem inscricoes no momento.';
      } else {
        resumo.textContent = `Mais inscrita: ${porModalidade[0].label} (${porModalidade[0].value})`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', loadAdminAnalytics);
})();






