(function(){
  const DEFAULTS = {
    title: "Concluído!",
    message: "Ação realizada com sucesso.",
    duration: 2600
  };

  let timer = null;
  let lastActive = null;

  function ensureDom(){
    if (document.getElementById("sf-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "sf-overlay";
    overlay.className = "sf-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("inert", "");

    overlay.innerHTML = `
      <div class="sf-card" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">
        <button class="sf-close" type="button" aria-label="Fechar">x</button>

        <div class="sf-icon" aria-hidden="true">
          <div class="sf-glow"></div>
          <svg class="sf-svg" viewBox="0 0 52 52">
            <circle class="sf-circle" cx="26" cy="26" r="24"></circle>
            <path class="sf-check" d="M14 27l7 7 17-17"></path>
          </svg>
          <div class="sf-ring"></div>
          <div class="sf-sparkles" aria-hidden="true"></div>
        </div>

        <h3 class="sf-title" id="sf-title">Concluído!</h3>
        <p class="sf-message" id="sf-message">Ação realizada com sucesso.</p>

        <div class="sf-actions">
          <button class="sf-btn" type="button">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener("mousedown", (e)=>{
      if(e.target === overlay) hide();
    });

    overlay.querySelector(".sf-btn").addEventListener("click", hide);
    overlay.querySelector(".sf-close").addEventListener("click", hide);

    window.addEventListener("keydown", (e)=>{
      if(e.key === "Escape" && overlay.classList.contains("sf-show")) hide();
    });
  }

  function buildSparkles(){
    const overlay = document.getElementById("sf-overlay");
    const box = overlay?.querySelector(".sf-sparkles");
    if(!box) return;

    box.innerHTML = "";
    const count = 8;

    for(let i=0;i<count;i++){
      const dot = document.createElement("i");
      const angle = (Math.PI * 2) * (i / count);
      const radius = 34 + Math.random()*10;

      const dx = Math.cos(angle) * radius;
      const dy = Math.sin(angle) * radius;
      const delay = 120 + i * 22;

      dot.style.left = "50%";
      dot.style.top = "50%";
      dot.style.setProperty("--dx", `${dx}px`);
      dot.style.setProperty("--dy", `${dy}px`);
      dot.style.animationDelay = `${delay}ms`;

      box.appendChild(dot);
    }
  }

  function show(opts){
    ensureDom();
    const overlay = document.getElementById("sf-overlay");
    const card = overlay.querySelector(".sf-card");
    const titleEl = document.getElementById("sf-title");
    const msgEl = document.getElementById("sf-message");
    const okBtn = overlay.querySelector(".sf-btn");

    const payload = {
      title: opts?.title ?? DEFAULTS.title,
      message: opts?.message ?? DEFAULTS.message,
      duration: opts?.duration ?? DEFAULTS.duration
    };

    titleEl.textContent = payload.title;
    msgEl.textContent = payload.message;

    lastActive = document.activeElement;
    overlay.classList.remove("sf-show");
    overlay.removeAttribute("aria-hidden");
    overlay.removeAttribute("inert");
    void card.offsetWidth;

    buildSparkles();

    overlay.classList.add("sf-show");

    setTimeout(()=> okBtn.focus(), 50);

    clearTimeout(timer);
    timer = setTimeout(hide, payload.duration);
  }

  function hide(){
    const overlay = document.getElementById("sf-overlay");
    if(!overlay) return;
    const active = document.activeElement;
    const focusWasInside = !!(active && overlay.contains(active));
    if (focusWasInside) {
      active.blur();
      const fallback = (lastActive && typeof lastActive.focus === "function") ? lastActive : document.body;
      try {
        fallback?.focus?.({ preventScroll: true });
      } catch (_) {
        fallback?.focus?.();
      }
    }
    overlay.classList.remove("sf-show");
    requestAnimationFrame(() => {
      overlay.setAttribute("inert", "");
      overlay.setAttribute("aria-hidden", "true");
    });
    clearTimeout(timer);
    timer = null;
  }

  window.SuccessFeedback = { show, hide };
})();
