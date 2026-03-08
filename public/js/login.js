document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  const form = document.getElementById("loginForm");
  const btn = document.getElementById("btnLogin");
  const toggle = document.getElementById("togglePass");
  const matricula = document.getElementById("matricula");
  const senha = document.getElementById("senha");

  function setFieldError(inputEl, msg) {
    const field = inputEl.closest(".field");
    field.classList.add("error");
    const hint = field.querySelector(".hint");
    if (hint) hint.textContent = msg || "";
    inputEl.setAttribute("aria-invalid", "true");
  }

  function clearFieldError(inputEl) {
    const field = inputEl.closest(".field");
    field.classList.remove("error");
    const hint = field.querySelector(".hint");
    if (hint) hint.textContent = "";
    inputEl.setAttribute("aria-invalid", "false");
  }

  function validate() {
    let ok = true;
    const m = (matricula.value || "").trim();
    const s = senha.value || "";

    clearFieldError(matricula);
    clearFieldError(senha);

    if (!/^[A-Za-z0-9]{3,20}$/.test(m)) {
      setFieldError(matricula, "Use um usuario valido (3 a 20 letras e numeros).");
      ok = false;
    }

    if (!s) {
      setFieldError(senha, "Informe sua senha.");
      ok = false;
    }

    return ok;
  }

  toggle?.addEventListener("click", () => {
    const isPass = senha.type === "password";
    senha.type = isPass ? "text" : "password";
    toggle.setAttribute("aria-label", isPass ? "Ocultar senha" : "Mostrar senha");
  });

  matricula?.addEventListener("input", () => {
    const normalized = (matricula.value || "").replace(/\s+/g, "").slice(0, 20);
    if (matricula.value !== normalized) matricula.value = normalized;
    clearFieldError(matricula);
  });

  senha?.addEventListener("input", () => {
    clearFieldError(senha);
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) {
      window.toast?.("Verifique os campos.", "err");
      return;
    }

    btn.classList.add("loading");
    btn.disabled = true;

    try {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          usuario: matricula.value.trim(),
          senha: senha.value
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.sucesso === false) {
        const motivo = String(data.motivo || "").toLowerCase();
        if (motivo === "senha") setFieldError(senha, "Senha incorreta.");
        if (motivo === "matricula") setFieldError(matricula, "Usuario nao encontrado.");
        const msg =
          data.mensagem ||
          (motivo === "senha"
            ? "Senha incorreta."
            : motivo === "matricula"
            ? "Usuario nao encontrado."
            : "Não foi possível entrar.");
        console.warn("Falha no login:", data);
        throw new Error(msg);
      }
      if (!data?.user) {
        console.warn("Login sem user retornado:", data);
        throw new Error("Não foi possível entrar.");
      }

      if (data?.user) {
        try {
          sessionStorage.setItem("usuarioLogado", JSON.stringify(data.user));
          sessionStorage.removeItem("adminSessionExpired");
        } catch (_) {}
      }
      window.toast?.("Login realizado!", "ok");
      const role = String(data.role || data?.user?.role || "").toUpperCase();
      if (role.includes("ADMIN")) window.location.href = "/admin.html";
      else window.location.href = "/dashboard.html";
    } catch (err) {
      window.toast?.(err.message, "err");
    } finally {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  });
});
