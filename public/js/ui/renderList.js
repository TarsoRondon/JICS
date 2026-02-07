export function renderList(el, title, rows, emptyText = 'Nada por aqui ainda.') {
  if (!el) return;
  const count = rows.length;
  el.innerHTML = `
    <div class="card-head">
      <h3>${title}</h3>
      <span class="muted">${count} itens</span>
    </div>
    ${count ? `
      <div class="list">
        ${rows.map(r => `
          <div class="list-item">
            <div class="item-title">${r.title}</div>
            ${r.subtitle ? `<div class="item-sub">${r.subtitle}</div>` : ''}
            ${r.meta ? `<div class="item-meta">${r.meta}</div>` : ''}
          </div>
        `).join('')}
      </div>
    ` : `<div class="empty">${emptyText}</div>`}
  `;
}

export function renderSkeletonList(el, title) {
  if (!el) return;
  el.innerHTML = `
    <div class="card-head">
      <h3>${title}</h3>
      <span class="muted">...</span>
    </div>
    <div class="list">
      ${Array.from({ length: 3 }).map(() => `
        <div class="list-item">
          <div class="skeleton-line lg"></div>
          <div class="skeleton-line"></div>
        </div>
      `).join('')}
    </div>
  `;
}
