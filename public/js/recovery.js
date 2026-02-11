(() => {
  const state = {
    mode: 'FIRST_ACCESS',
    validated: false,
    masked: '',
    token: '',
    cooldown: 0,
    timer: null,
    passwordUx: null,
  };

  const modeTabs = document.querySelectorAll('.mode-tab');
  const matriculaInput = document.getElementById('matricula');
  const contatoInput = document.getElementById('contato');
  const contactLabel = document.getElementById('contactLabel');
  const btnValidate = document.getElementById('btnValidate');
  const btnSendOtp = document.getElementById('btnSendOtp');
  const btnVerifyOtp = document.getElementById('btnVerifyOtp');
  const btnResend = document.getElementById('btnResend');
  const btnSavePassword = document.getElementById('btnSavePassword');
  const otpInput = document.getElementById('otp');
  const otpHint = document.getElementById('otpHint');
  const otpError = document.getElementById('otpError');
  const statusBox = document.getElementById('statusBox');
  const form = document.getElementById('recoveryForm');
  const usernameHidden = document.getElementById('usernameHidden');
  const loginBackLink = document.getElementById('loginBackLink');
  const cancelLoggedIn = document.getElementById('cancelLoggedIn');
  const cancelRecovery = document.getElementById('cancelRecovery');

  const stepOtp = document.getElementById('step-otp');
  const stepPassword = document.getElementById('step-password');
  const newPasswordInput = document.getElementById('newPassword');
  const confirmPasswordInput = document.getElementById('confirmPassword');

  function markField(input) {
    if (!input) return;
    input.classList.add('input-error');
    input.setAttribute('aria-invalid', 'true');
  }

  function clearField(input) {
    if (!input) return;
    input.classList.remove('input-error');
    input.removeAttribute('aria-invalid');
  }

  function clearAllFieldErrors() {
    [matriculaInput, contatoInput, otpInput, newPasswordInput, confirmPasswordInput].forEach(clearField);
    setOtpError('');
  }

  function scrollToFirstError() {
    const target = document.querySelector('.input-error');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }
  }

  function getLoggedUser() {
    try {
      const raw = sessionStorage.getItem('usuarioLogado');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  const loggedUser = getLoggedUser();
  if (loggedUser && loggedUser.matricula) {
    if (cancelLoggedIn) cancelLoggedIn.classList.remove('hidden');
    if (loginBackLink) loginBackLink.classList.add('hidden');
    if (cancelRecovery) {
      cancelRecovery.addEventListener('click', () => {
        window.location.href = '/perfil.html';
      });
    }
  }

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

  function applyPhoneMask() {
    if (getSelectedCanal() !== 'sms') return;
    const formatted = formatPhone(contatoInput.value);
    contatoInput.value = formatted;
  }

  function getSelectedCanal() {
    const radio = document.querySelector('input[name="canal"]:checked');
    return radio ? radio.value : 'sms';
  }

  function setStatus(message, type = 'success') {
    if (!statusBox) return;
    statusBox.textContent = message || '';
    statusBox.classList.toggle('hidden', !message);
    statusBox.classList.toggle('error', type === 'error');
  }

  function setOtpError(message) {
    if (!otpError) return;
    otpError.textContent = message || '';
    otpError.classList.toggle('hidden', !message);
  }

  function setLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.dataset.loading = isLoading ? '1' : '0';
    btn.textContent = isLoading ? 'Aguarde...' : btn.dataset.label;
  }

  function resetFlow() {
    state.validated = false;
    state.masked = '';
    state.token = '';
    stepOtp.classList.add('hidden');
    stepPassword.classList.add('hidden');
    btnSendOtp.classList.add('hidden');
    btnSendOtp.disabled = true;
    btnResend.disabled = true;
    otpInput.value = '';
    setOtpError('');
    setStatus('', 'success');
    clearAllFieldErrors();
  }

  function updateContactField() {
    const canal = getSelectedCanal();
    if (canal === 'sms') {
      contactLabel.textContent = 'Telefone';
      contatoInput.type = 'tel';
      contatoInput.placeholder = '(00) 00000-0000';
      contatoInput.autocomplete = 'tel';
    } else if (canal === 'email_academico') {
      contactLabel.textContent = 'E-mail academico';
      contatoInput.type = 'email';
      contatoInput.placeholder = 'seu.email@ifro.edu.br';
      contatoInput.autocomplete = 'email';
    } else {
      contactLabel.textContent = 'E-mail pessoal';
      contatoInput.type = 'email';
      contatoInput.placeholder = 'seu.email@provedor.com';
      contatoInput.autocomplete = 'email';
    }
  }

  function setMode(mode) {
    state.mode = mode;
    if (document?.body) {
      document.body.classList.toggle('is-reset', mode === 'RESET_PASSWORD');
    }
    modeTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    resetFlow();
  }

  function startCooldown(seconds = 60) {
    state.cooldown = seconds;
    btnResend.disabled = true;
    btnResend.textContent = `Reenviar (${state.cooldown}s)`;
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(() => {
      state.cooldown -= 1;
      if (state.cooldown <= 0) {
        clearInterval(state.timer);
        btnResend.disabled = false;
        btnResend.textContent = 'Reenviar';
        return;
      }
      btnResend.textContent = `Reenviar (${state.cooldown}s)`;
    }, 1000);
  }

  async function validateData() {
    const matricula = (matriculaInput.value || '').trim();
    const canal = getSelectedCanal();
    const contato = (contatoInput.value || '').trim();
    clearAllFieldErrors();
    if (!matricula || !contato) {
      if (!matricula) markField(matriculaInput);
      if (!contato) markField(contatoInput);
      setStatus('Preencha matricula e contato.', 'error');
      scrollToFirstError();
      return;
    }

    setLoading(btnValidate, true);
    try {
      const res = await fetch('/auth/recovery/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricula, canal, contato, finalidade: state.mode })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Dados nao conferem.');
      }
      state.validated = true;
      state.masked = data.masked || '';
      btnSendOtp.classList.remove('hidden');
      btnSendOtp.disabled = false;
      setStatus('Dados confirmados. Voce pode solicitar o codigo.', 'success');
    } catch (err) {
      resetFlow();
      setStatus(err.message || 'Dados nao conferem.', 'error');
      markField(matriculaInput);
      markField(contatoInput);
      scrollToFirstError();
    } finally {
      setLoading(btnValidate, false);
    }
  }

  async function sendOtp() {
    if (!state.validated) return;
    const matricula = (matriculaInput.value || '').trim();
    const canal = getSelectedCanal();
    const contato = (contatoInput.value || '').trim();
    setLoading(btnSendOtp, true);
    setOtpError('');
    clearField(contatoInput);
    try {
      const res = await fetch('/auth/recovery/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricula, canal, finalidade: state.mode, contato })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.code === 'WAIT') {
          const seconds = data.secondsLeft ? `${data.secondsLeft}s` : 'alguns segundos';
          throw new Error(`Aguarde ${seconds} para reenviar.`);
        }
        if (data.code === 'BLOCKED') {
          throw new Error('Muitas tentativas. Aguarde alguns minutos.');
        }
        if (data.code === 'SMS_TRIAL_UNVERIFIED') {
          throw new Error('Conta de teste: este numero precisa estar verificado para receber SMS.');
        }
        if (data.code === 'SMS_NOT_CONFIGURED') {
          throw new Error('SMS indisponivel no momento. Tente por e-mail.');
        }
        if (data.code === 'SMS_PROVIDER_ERROR') {
          throw new Error('Nao foi possivel enviar o SMS agora. Tente novamente.');
        }
        if (data.code === 'SMS_INVALID_NUMBER') {
          markField(contatoInput);
          scrollToFirstError();
          throw new Error('Telefone invalido.');
        }
        throw new Error(data.message || 'Nao foi possivel enviar o codigo.');
      }
      stepOtp.classList.remove('hidden');
      otpHint.textContent = data.masked ? `Codigo enviado para ${data.masked}.` : 'Codigo enviado.';
      startCooldown(60);
      const successMsg = data.masked
        ? `Enviamos um codigo para ${data.masked}.`
        : 'Codigo enviado. Verifique seu contato.';
      setStatus('', 'success');
      if (window.SuccessFeedback?.show) {
        window.SuccessFeedback.show({ title: 'Codigo enviado', message: successMsg, duration: 2800 });
      }
    } catch (err) {
      setStatus(err.message || 'Nao foi possivel enviar o codigo.', 'error');
    } finally {
      setLoading(btnSendOtp, false);
    }
  }

  async function verifyOtp() {
    const matricula = (matriculaInput.value || '').trim();
    const otp = (otpInput.value || '').trim();
    if (!otp || otp.length < 6) {
      setOtpError('Informe o codigo de 6 digitos.');
      markField(otpInput);
      scrollToFirstError();
      return;
    }
    setLoading(btnVerifyOtp, true);
    setOtpError('');
    clearField(otpInput);
    try {
      const res = await fetch('/auth/recovery/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricula, finalidade: state.mode, otp })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const attemptsLeft = data.attemptsLeft !== undefined ? ` Restam ${data.attemptsLeft} tentativas.` : '';
        throw new Error((data.message || 'Codigo invalido.') + attemptsLeft);
      }
      state.token = data.token;
      stepPassword.classList.remove('hidden');
      setStatus('Codigo confirmado. Defina sua senha.', 'success');
    } catch (err) {
      setOtpError(err.message || 'Codigo invalido.');
      markField(otpInput);
      scrollToFirstError();
    } finally {
      setLoading(btnVerifyOtp, false);
    }
  }

  async function savePassword() {
    if (!state.token) {
      setStatus('Confirme o codigo antes de salvar a senha.', 'error');
      scrollToFirstError();
      return;
    }
    if (state.passwordUx && !state.passwordUx.isValid()) {
      setStatus('Senha fraca. Verifique as regras.', 'error');
      markField(newPasswordInput);
      markField(confirmPasswordInput);
      scrollToFirstError();
      return;
    }
    setLoading(btnSavePassword, true);
    try {
      const newPassword = document.getElementById('newPassword').value;
      const res = await fetch('/auth/recovery/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: state.token, newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Nao foi possivel atualizar a senha.');
      }
      if (window.SuccessFeedback?.show) {
        window.SuccessFeedback.show({ title: 'Senha atualizada', message: 'Voce ja pode acessar o sistema.' });
      }
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 1200);
    } catch (err) {
      setStatus(err.message || 'Nao foi possivel atualizar a senha.', 'error');
    } finally {
      setLoading(btnSavePassword, false);
    }
  }

  function handleFieldChange() {
    if (!state.validated) return;
    resetFlow();
  }

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  });

  if (form) {
    form.addEventListener('submit', (event) => event.preventDefault());
  }

  btnValidate.addEventListener('click', validateData);
  btnSendOtp.addEventListener('click', sendOtp);
  btnVerifyOtp.addEventListener('click', verifyOtp);
  btnSavePassword.addEventListener('click', savePassword);
  btnResend.addEventListener('click', sendOtp);

  matriculaInput.addEventListener('input', handleFieldChange);
  matriculaInput.addEventListener('input', () => clearField(matriculaInput));
  matriculaInput.addEventListener('input', () => {
    if (usernameHidden) usernameHidden.value = matriculaInput.value;
  });
  contatoInput.addEventListener('input', () => {
    applyPhoneMask();
    handleFieldChange();
    clearField(contatoInput);
  });
  document.querySelectorAll('input[name="canal"]').forEach(radio => {
    radio.addEventListener('change', () => {
      updateContactField();
      handleFieldChange();
      clearField(contatoInput);
    });
  });
  otpInput.addEventListener('input', () => {
    clearField(otpInput);
    setOtpError('');
  });
  newPasswordInput?.addEventListener('input', () => clearField(newPasswordInput));
  confirmPasswordInput?.addEventListener('input', () => clearField(confirmPasswordInput));

  const hash = window.location.hash.replace('#', '');
  if (hash === 'reset') setMode('RESET_PASSWORD');
  else setMode('FIRST_ACCESS');

  updateContactField();
  btnValidate.dataset.label = btnValidate.textContent;
  btnSendOtp.dataset.label = btnSendOtp.textContent;
  btnVerifyOtp.dataset.label = btnVerifyOtp.textContent;
  btnSavePassword.dataset.label = btnSavePassword.textContent;

  if (window.setupPasswordUX) {
    state.passwordUx = window.setupPasswordUX({
      passwordId: 'newPassword',
      confirmId: 'confirmPassword',
      buttonId: 'btnSavePassword',
      rulesId: 'passwordRules',
      strengthBarId: 'strengthBar',
      strengthTextId: 'strengthText',
      matchId: 'matchText'
    });
  }

  if (usernameHidden) {
    usernameHidden.value = matriculaInput.value || '';
  }
})();
