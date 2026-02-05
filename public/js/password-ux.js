(() => {
  const SYMBOL_REGEX = /[^A-Za-z0-9]/;

  function setupPasswordUX(options) {
    const cfg = options || {};
    const senhaInput = document.getElementById(cfg.passwordId || cfg.senhaId || 'newSenha');
    const confirmInput = document.getElementById(cfg.confirmId || 'confirmSenha');
    const submitBtn = document.getElementById(cfg.buttonId || 'btnCadastrar');
    const rulesWrap = cfg.rulesId ? document.getElementById(cfg.rulesId) : null;
    const strengthBar = cfg.strengthBarId ? document.getElementById(cfg.strengthBarId) : null;
    const strengthText = cfg.strengthTextId ? document.getElementById(cfg.strengthTextId) : null;
    const matchText = cfg.matchId ? document.getElementById(cfg.matchId) : null;

    if (!senhaInput || !confirmInput) return null;

    const ruleEls = rulesWrap ? {
      length: rulesWrap.querySelector('[data-rule="length"]'),
      upper: rulesWrap.querySelector('[data-rule="upper"]'),
      number: rulesWrap.querySelector('[data-rule="number"]'),
      symbol: rulesWrap.querySelector('[data-rule="symbol"]')
    } : {};

    let lastValid = false;

    function updateRule(el, ok) {
      if (!el) return;
      el.classList.toggle('rule-ok', ok);
      el.classList.toggle('rule-bad', !ok);
      const icon = el.querySelector('.rule-icon');
      if (icon) icon.textContent = ok ? '✅' : '❌';
    }

    function updateStrength(score) {
      const percent = Math.round((score / 4) * 100);
      if (strengthBar) strengthBar.style.width = `${percent}%`;
      if (strengthBar) {
        const color = score >= 4 ? '#16a34a' : score >= 2 ? '#f59e0b' : '#ef4444';
        strengthBar.style.background = color;
      }
      if (strengthText) {
        const label = score >= 4 ? 'Forte' : score >= 2 ? 'Media' : 'Fraca';
        strengthText.textContent = `Forca: ${label}`;
      }
    }

    function updateMatch(match) {
      if (!matchText) return;
      matchText.textContent = `${match ? '✅' : '❌'} Senhas conferem`;
      matchText.classList.toggle('match-ok', match);
      matchText.classList.toggle('match-bad', !match);
    }

    function toggleButton(valid) {
      if (!submitBtn) return;
      submitBtn.disabled = !valid;
      submitBtn.classList.toggle('btn-disabled', !valid);
    }

    function evaluate() {
      const senha = String(senhaInput.value || '');
      const confirm = String(confirmInput.value || '');

      const rules = {
        length: senha.length >= 8,
        upper: /[A-Z]/.test(senha),
        number: /[0-9]/.test(senha),
        symbol: SYMBOL_REGEX.test(senha)
      };

      const score = Object.values(rules).filter(Boolean).length;
      updateRule(ruleEls.length, rules.length);
      updateRule(ruleEls.upper, rules.upper);
      updateRule(ruleEls.number, rules.number);
      updateRule(ruleEls.symbol, rules.symbol);
      updateStrength(score);

      const match = senha.length > 0 && confirm.length > 0 && senha === confirm;
      updateMatch(match);

      lastValid = score === 4 && match;
      toggleButton(lastValid);
      return lastValid;
    }

    senhaInput.addEventListener('input', evaluate);
    confirmInput.addEventListener('input', evaluate);
    evaluate();

    return { isValid: () => lastValid, evaluate };
  }

  window.setupPasswordUX = setupPasswordUX;
})();

