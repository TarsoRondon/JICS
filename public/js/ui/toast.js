function toast(message, type = 'ok') {
  if (typeof window !== 'undefined') {
    window.toast = window.toast || toast;
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.type = type;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

if (typeof window !== 'undefined') {
  window.toast = window.toast || toast;
}

