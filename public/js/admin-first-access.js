document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("firstAccessForm") || document.createElement("form");
    const btn = document.getElementById("btnFirstAccess") || document.createElement("button");
    const matriculaInput = document.getElementById("firstMatricula") || document.createElement("input");
    const senhaInput = document.getElementById("firstSenha") || document.createElement("input");
    const confirmInput = document.getElementById("firstConfirm") || document.createElement("input");

    // Get user from sessionStorage
    const userData = JSON.parse(sessionStorage.getItem('firstAccessUser') || '{}');
    if (!userData.matricula) {
        window.location.href = '/';
        return;
    }

    matriculaInput.value = userData.matricula;
    matriculaInput.readOnly = true;

    function validateFirstAccess() {
        const senha = senhaInput.value;
        const confirm = confirmInput.value;
        if (senha.length < 6) return false;
        if (senha !== confirm) return false;
        return true;
    }

    form.addEventListener("submit", async(e) => {
        e.preventDefault();
        if (!validateFirstAccess()) {
            alert("Senha deve ter 6+ chars e coincidir.");
            return;
        }

        btn.disabled = true;
        btn.textContent = "Salvando...";

        try {
            const res = await fetch("/admin/setup-first-access", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    matricula: userData.matricula,
                    nova_senha: senhaInput.value
                })
            });

            const data = await res.json();
            if (data.sucesso) {
                sessionStorage.removeItem('firstAccessUser');
                window.location.href = '/admin/dashboard.html';
            } else {
                alert(data.mensagem || "Erro ao salvar.");
            }
        } catch (err) {
            alert("Erro de conexão.");
        } finally {
            btn.disabled = false;
            btn.textContent = "Concluir Primeiro Acesso";
        }
    });
});