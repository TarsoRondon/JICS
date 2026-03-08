(() => {
  const EMAIL_CANAIS = new Set(['email_pessoal', 'email_academico']);

  const state = {
    mode: 'FIRST_ACCESS',
    validated: false,
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

  function getSelectedCanal() {
    const radio = document.querySelector('input[name="canal"]:checked');
    const canal = String(radio?.value || 'email_pessoal');
    return EMAIL_CANAIS.has(canal) ? canal : 'email_pessoal';
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

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

  function updateContactField() {
    if (!contatoInput) return;
    const canal = getSelectedCanal();
    const isAcademico = canal === 'email_academico';
    if (contactLabel) {
      contactLabel.textContent = isAcademico ? 'E-mail academico' : 'E-mail pessoal';
    }
    contatoInput.type = 'email';
    contatoInput.autocomplete = 'email';
    contatoInput.placeholder = isAcademico ? 'seu.email@ifro.edu.br' : 'seu.email@provedor.com';
    const normalized = normalizeEmail(contatoInput.value);
    if (contatoInput.value !== normalized) {
      contatoInput.value = normalized;
    }
  }

  function resetFlow() {
    state.validated = false;
    state.token = '';
    if (stepOtp) stepOtp.classList.add('hidden');
    if (stepPassword) stepPassword.classList.add('hidden');
    if (btnSendOtp) {
      btnSendOtp.classList.add('hidden');
      btnSendOtp.disabled = true;
    }
    if (btnResend) {
      btnResend.disabled = true;
      btnResend.textContent = btnResend.dataset.label || 'Reenviar';
    }
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    state.cooldown = 0;
    if (otpInput) otpInput.value = '';
    if (otpHint) otpHint.textContent = '';
    setOtpError('');
    setStatus('', 'success');
    clearAllFieldErrors();
  }

  function setMode(mode) {
    state.mode = mode;
    if (document?.body) {
      document.body.classList.toggle('is-reset', mode === 'RESET_PASSWORD');
    }
    modeTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    resetFlow();
  }

  function startCooldown(seconds = 60) {
    if (!btnResend) return;
    state.cooldown = seconds;
    btnResend.disabled = true;
    btnResend.textContent = `Reenviar (${state.cooldown}s)`;
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(() => {
      state.cooldown -= 1;
      if (state.cooldown <= 0) {
        clearInterval(state.timer);
        state.timer = null;
        btnResend.disabled = false;
        btnResend.textContent = btnResend.dataset.label || 'Reenviar';
        return;
      }
      btnResend.textContent = `Reenviar (${state.cooldown}s)`;
    }, 1000);
  }

  async function validateData() {
    const matricula = String(matriculaInput?.value || '').trim();
    const canal = getSelectedCanal();
    const contato = normalizeEmail(contatoInput?.value || '');
    clearAllFieldErrors();

    if (!matricula || !contato) {
      if (!matricula) markField(matriculaInput);
      if (!contato) markField(contatoInput);
      setStatus('Preencha matricula e e-mail.', 'error');
      scrollToFirstError();
      return;
    }

    if (!isValidEmail(contato)) {
      markField(contatoInput);
      setStatus('Informe um e-mail valido.', 'error');
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
      if (btnSendOtp) {
        btnSendOtp.classList.remove('hidden');
        btnSendOtp.disabled = false;
      }
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

    const matricula = String(matriculaInput?.value || '').trim();
    const canal = getSelectedCanal();
    const contato = normalizeEmail(contatoInput?.value || '');

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
        if (data.code === 'EMAIL_FAILED') {
          throw new Error('Nao foi possivel enviar o codigo por e-mail agora.');
        }
        throw new Error(data.message || 'Nao foi possivel enviar o codigo.');
      }

      if (stepOtp) stepOtp.classList.remove('hidden');
      if (otpHint) {
        otpHint.textContent = data.masked ? `Codigo enviado para ${data.masked}.` : 'Codigo enviado para seu e-mail.';
      }
      startCooldown(60);
      setStatus('', 'success');

      if (window.SuccessFeedback?.show) {
        window.SuccessFeedback.show({
          title: 'Codigo enviado',
          message: data.masked ? `Enviamos um codigo para ${data.masked}.` : 'Verifique sua caixa de entrada.',
          duration: 2600,
        });
      }
    } catch (err) {
      setStatus(err.message || 'Nao foi possivel enviar o codigo.', 'error');
    } finally {
      setLoading(btnSendOtp, false);
    }
  }

  async function verifyOtp() {
    const matricula = String(matriculaInput?.value || '').trim();
    const otp = String(otpInput?.value || '').trim();
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
      if (stepPassword) stepPassword.classList.remove('hidden');
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
      const newPassword = String(newPasswordInput?.value || '');
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
    if (state.validated) resetFlow();
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
  if (loggedUser?.matricula) {
    if (cancelLoggedIn) cancelLoggedIn.classList.remove('hidden');
    if (loginBackLink) loginBackLink.classList.add('hidden');
    if (cancelRecovery) {
      cancelRecovery.addEventListener('click', () => {
        window.location.href = '/perfil.html';
      });
    }
  }

  modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  });

  if (form) {
    form.addEventListener('submit', (event) => event.preventDefault());
  }

  btnValidate?.addEventListener('click', validateData);
  btnSendOtp?.addEventListener('click', sendOtp);
  btnVerifyOtp?.addEventListener('click', verifyOtp);
  btnSavePassword?.addEventListener('click', savePassword);
  btnResend?.addEventListener('click', sendOtp);

  matriculaInput?.addEventListener('input', () => {
    handleFieldChange();
    clearField(matriculaInput);
    if (usernameHidden) usernameHidden.value = matriculaInput.value || '';
  });

  contatoInput?.addEventListener('input', () => {
    const normalized = normalizeEmail(contatoInput.value);
    if (contatoInput.value !== normalized) contatoInput.value = normalized;
    handleFieldChange();
    clearField(contatoInput);
  });

  document.querySelectorAll('input[name="canal"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      updateContactField();
      handleFieldChange();
      clearField(contatoInput);
    });
  });

  otpInput?.addEventListener('input', () => {
    clearField(otpInput);
    setOtpError('');
  });

  newPasswordInput?.addEventListener('input', () => clearField(newPasswordInput));
  confirmPasswordInput?.addEventListener('input', () => clearField(confirmPasswordInput));

  const hash = window.location.hash.replace('#', '');
  if (hash === 'reset') setMode('RESET_PASSWORD');
  else setMode('FIRST_ACCESS');

  updateContactField();
  if (btnValidate) btnValidate.dataset.label = btnValidate.textContent;
  if (btnSendOtp) btnSendOtp.dataset.label = btnSendOtp.textContent;
  if (btnVerifyOtp) btnVerifyOtp.dataset.label = btnVerifyOtp.textContent;
  if (btnSavePassword) btnSavePassword.dataset.label = btnSavePassword.textContent;
  if (btnResend) btnResend.dataset.label = 'Reenviar';

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
    usernameHidden.value = matriculaInput?.value || '';
  }
})();
