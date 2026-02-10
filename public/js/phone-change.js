(() => {
  const state = {
    phoneToken: '',
    cooldownOld: 0,
    cooldownNew: 0,
    timerOld: null,
    timerNew: null,
  };

  const statusOld = document.getElementById('statusOld');
  const statusNew = document.getElementById('statusNew');
  const stepNew = document.getElementById('stepNew');

  const btnSendOld = document.getElementById('btnSendOld');
  const btnResendOld = document.getElementById('btnResendOld');
  const btnVerifyOld = document.getElementById('btnVerifyOld');
  const otpOld = document.getElementById('otpOld');

  const btnSendNew = document.getElementById('btnSendNew');
  const btnResendNew = document.getElementById('btnResendNew');
  const btnVerifyNew = document.getElementById('btnVerifyNew');
  const otpNew = document.getElementById('otpNew');
  const novoTelefone = document.getElementById('novoTelefone');

  function formatPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length > 11) {
      digits = digits.slice(2);
    }
    digits = digits.slice(0, 11);
    if (!digits) return '';
    if (digits.length < 3) return `(${digits}`;
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    const mobile = digits.length > 10;
    const part1Len = mobile ? 5 : 4;
    const part1 = rest.slice(0, part1Len);
    const part2 = rest.slice(part1Len, part1Len + 4);
    if (!part2) return `(${ddd}) ${part1}`;
    return `(${ddd}) ${part1}-${part2}`;
  }

  function setStatus(el, message, type = 'success') {
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('hidden', !message);
    el.classList.toggle('error', type === 'error');
  }

  function setLoading(btn, isLoading) {
    if (!btn) return;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Aguarde...' : btn.dataset.label;
  }

  function startCooldown({ btn, seconds, timerKey, label = 'Reenviar' }) {
    if (!btn) return;
    state[timerKey] = seconds;
    btn.disabled = true;
    btn.textContent = `${label} (${state[timerKey]}s)`;
    if (state[timerKey + 'Interval']) clearInterval(state[timerKey + 'Interval']);
    state[timerKey + 'Interval'] = setInterval(() => {
      state[timerKey] -= 1;
      if (state[timerKey] <= 0) {
        clearInterval(state[timerKey + 'Interval']);
        btn.disabled = false;
        btn.textContent = label;
        return;
      }
      btn.textContent = `${label} (${state[timerKey]}s)`;
    }, 1000);
  }

  async function requestOld() {
    setLoading(btnSendOld, true);
    try {
      const res = await fetch('/auth/phone/change/request-old', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Nao foi possivel enviar o codigo.');
      }
      setStatus(statusOld, data.masked ? `Codigo enviado para ${data.masked}.` : 'Codigo enviado.', 'success');
      startCooldown({ btn: btnResendOld, seconds: 60, timerKey: 'cooldownOld' });
    } catch (err) {
      setStatus(statusOld, err.message || 'Nao foi possivel enviar o codigo.', 'error');
    } finally {
      setLoading(btnSendOld, false);
    }
  }

  async function verifyOld() {
    const otp = (otpOld.value || '').trim();
    if (otp.length < 6) {
      setStatus(statusOld, 'Informe o codigo de 6 digitos.', 'error');
      return;
    }
    setLoading(btnVerifyOld, true);
    try {
      const res = await fetch('/auth/phone/change/verify-old', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ otp })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const attemptsLeft = data.attemptsLeft !== undefined ? ` Restam ${data.attemptsLeft} tentativas.` : '';
        throw new Error((data.message || 'Codigo invalido.') + attemptsLeft);
      }
      state.phoneToken = data.phoneChangeToken || '';
      stepNew.classList.remove('hidden');
      setStatus(statusOld, 'Telefone atual confirmado. Informe o novo numero.', 'success');
    } catch (err) {
      setStatus(statusOld, err.message || 'Codigo invalido.', 'error');
    } finally {
      setLoading(btnVerifyOld, false);
    }
  }

  async function requestNew() {
    const phone = (novoTelefone.value || '').trim();
    if (!phone) {
      setStatus(statusNew, 'Informe o novo telefone.', 'error');
      return;
    }
    if (!state.phoneToken) {
      setStatus(statusNew, 'Confirme o telefone atual primeiro.', 'error');
      return;
    }
    setLoading(btnSendNew, true);
    try {
      const res = await fetch('/auth/phone/change/request-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phoneChangeToken: state.phoneToken, novoTelefone: phone })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Nao foi possivel enviar o codigo.');
      }
      setStatus(statusNew, data.masked ? `Codigo enviado para ${data.masked}.` : 'Codigo enviado.', 'success');
      startCooldown({ btn: btnResendNew, seconds: 60, timerKey: 'cooldownNew' });
    } catch (err) {
      setStatus(statusNew, err.message || 'Nao foi possivel enviar o codigo.', 'error');
    } finally {
      setLoading(btnSendNew, false);
    }
  }

  async function verifyNew() {
    const otp = (otpNew.value || '').trim();
    const phone = (novoTelefone.value || '').trim();
    if (!phone) {
      setStatus(statusNew, 'Informe o novo telefone.', 'error');
      return;
    }
    if (otp.length < 6) {
      setStatus(statusNew, 'Informe o codigo de 6 digitos.', 'error');
      return;
    }
    if (!state.phoneToken) {
      setStatus(statusNew, 'Confirme o telefone atual primeiro.', 'error');
      return;
    }
    setLoading(btnVerifyNew, true);
    try {
      const res = await fetch('/auth/phone/change/verify-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phoneChangeToken: state.phoneToken, novoTelefone: phone, otp })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const attemptsLeft = data.attemptsLeft !== undefined ? ` Restam ${data.attemptsLeft} tentativas.` : '';
        throw new Error((data.message || 'Codigo invalido.') + attemptsLeft);
      }
      setStatus(statusNew, 'Telefone atualizado com sucesso.', 'success');
      if (window.SuccessFeedback?.show) {
        window.SuccessFeedback.show({ title: 'Telefone atualizado', message: 'Seu telefone foi alterado com sucesso.' });
      }
    } catch (err) {
      setStatus(statusNew, err.message || 'Nao foi possivel atualizar o telefone.', 'error');
    } finally {
      setLoading(btnVerifyNew, false);
    }
  }

  if (btnSendOld) btnSendOld.addEventListener('click', requestOld);
  if (btnResendOld) btnResendOld.addEventListener('click', requestOld);
  if (btnVerifyOld) btnVerifyOld.addEventListener('click', verifyOld);

  if (novoTelefone) {
    novoTelefone.addEventListener('input', () => {
      novoTelefone.value = formatPhone(novoTelefone.value);
    });
  }

  if (btnSendNew) btnSendNew.addEventListener('click', requestNew);
  if (btnResendNew) btnResendNew.addEventListener('click', requestNew);
  if (btnVerifyNew) btnVerifyNew.addEventListener('click', verifyNew);
})();
