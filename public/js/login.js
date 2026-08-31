document.addEventListener("DOMContentLoaded", function() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }

    var form = document.getElementById("loginForm");
    var btn = document.getElementById("btnLogin");
    var toggle = document.getElementById("togglePass");
    var matricula = document.getElementById("matricula");
    var senha = document.getElementById("senha");

    function setFieldError(inputEl, msg) {
        var field = inputEl.closest(".field");
        field.classList.add("error");
        var hint = field.querySelector(".hint");
        if (hint) hint.textContent = msg || "";
        inputEl.setAttribute("aria-invalid", "true");
    }

    function clearFieldError(inputEl) {
        var field = inputEl.closest(".field");
        field.classList.remove("error");
        var hint = field.querySelector(".hint");
        if (hint) hint.textContent = "";
        inputEl.setAttribute("aria-invalid", "false");
    }

    function validate() {
        var ok = true;
        var m = (matricula.value || "").trim();
        var s = senha.value || "";

        clearFieldError(matricula);
        clearFieldError(senha);

        if (m.length < 3) {
            setFieldError(matricula, "Use matrícula ou email válido (3+ chars).");
            ok = false;
        } else if (m.indexOf('@') !== -1 && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(m)) {
            setFieldError(matricula, "Email inválido.");
            ok = false;
        } else if (m.indexOf('@') === -1 && !/^[A-Za-z0-9]{3,20}$/.test(m)) {
            setFieldError(matricula, "Matrícula inválida (3-20 alfanuméricos).");
            ok = false;
        }

        if (!s) {
            setFieldError(senha, "Informe sua senha.");
            ok = false;
        }

        return ok;
    }

    if (toggle) {
        toggle.addEventListener("click", function() {
            var isPass = senha.type === "password";
            senha.type = isPass ? "text" : "password";
            toggle.setAttribute("aria-label", isPass ? "Ocultar senha" : "Mostrar senha");
        });
    }

    if (matricula) {
        matricula.addEventListener("input", function() {
            var normalized = (matricula.value || "").replace(/\s+/g, "").slice(0, 100);
            if (matricula.value !== normalized) matricula.value = normalized;
            clearFieldError(matricula);
        });
    }

    if (senha) {
        senha.addEventListener("input", function() {
            clearFieldError(senha);
        });
    }

    if (form) {
        form.addEventListener("submit", function(e) {
            e.preventDefault();
            if (!validate()) {
                if (window.toast) window.toast("Verifique os campos.", "err");
                return;
            }

            btn.classList.add("loading");
            btn.disabled = true;

            fetch("/login", {

                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        usuario: matricula.value.trim(),
                        senha: senha.value
                    })
                })
                .then(function(res) {
                    return res.json().then(function(data) {
                        return { res: res, data: data };
                    });
                })
                .then(function(result) {
                    var data = result.data;
                    var res = result.res;

                    if (!res.ok || data.sucesso === false) {
                        var motivo = String(data.motivo || "").toLowerCase();
                        if (motivo === "senha") setFieldError(senha, "Senha incorreta.");
                        if (motivo === "matricula") setFieldError(matricula, "Usuário não encontrado.");
                        if (motivo === "inativo") setFieldError(matricula, "Conta desativada.");
                        var msg = data.mensagem || (
                            motivo === "senha" ? "Senha incorreta." :
                            motivo === "matricula" ? "Usuário não encontrado." :
                            "Não foi possível entrar."
                        );
                        console.warn("Falha no login:", data);
                        throw new Error(msg);
                    }
                    if (!data.user) {
                        console.warn("Login sem user:", data);
                        throw new Error("Não foi possível entrar.");
                    }

                    try {
                        sessionStorage.setItem("usuarioLogado", JSON.stringify(data.user));
                        sessionStorage.removeItem("adminSessionExpired");
                    } catch (_) {}

                    if (window.toast) window.toast("Login realizado!", "ok");

                    if (data.primeiro_acesso) {
                        sessionStorage.setItem('firstAccessUser', JSON.stringify(data.user));
                        window.location.href = '/app-primeiro-acesso.html';
                        return;
                    }


                    var role = String(data.role || (data.user ? data.user.role : "") || "").toUpperCase();

                    if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'STAFF') {
                        window.location.href = '/admin/dashboard.html';
                    } else {
                        window.location.href = '/aluno/dashboard.html';
                    }
                })
                .catch(function(err) {
                    if (window.toast) window.toast(err.message, "err");
                })
                .finally(function() {
                    btn.classList.remove("loading");
                    btn.disabled = false;
                });
        });
    }
});