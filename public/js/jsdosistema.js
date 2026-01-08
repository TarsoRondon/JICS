let senhaPendente = null;
const modalidades = [{
    id: 1,
    nome: "Atletismo",
    professor: "Prof. Juarez",
    dias: "Segunda e Sexta",
    horario: "18h30 às 21h",
    icon: "🏃",
    descricao: "Corridas, saltos e lançamentos em pista.",
    video: "https://www.youtube.com/embed/..."
}, {
    id: 2,
    nome: "Basquete",
    professor: "Prof. Juarez",
    dias: "Terça e Quinta",
    horario: "18h30 às 21h",
    icon: "🏀",
    descricao: "Esporte coletivo jogado em quadra."
}, {
    id: 3,
    nome: "Futsal",
    professor: "A definir",
    dias: "Segunda e Quarta",
    horario: "18h30 às 21h",
    icon: "⚽",
    descricao: "Futebol adaptado para ambientes fechados."
}, {
    id: 4,
    nome: "Voleibol",
    professor: "Prof. Juarez",
    dias: "Quarta e Sexta",
    horario: "18h30 às 21h",
    icon: "🏐",
    descricao: "Esporte coletivo com bola e rede."
}, {
    id: 5,
    nome: "Handball",
    professor: "Profa. Alyne",
    dias: "Terça e Quinta",
    horario: "18h30 às 21h",
    icon: "🤾",
    descricao: "Jogo rápido com bola e gol."
}, {
    id: 6,
    nome: "Tênis de Mesa",
    professor: "Treinamento Livre",
    dias: "Segundas e Quartas",
    horario: "18h30 às 21h",
    icon: "🏓",
    descricao: "Esporte de raquete em miniatura."
}, {
    id: 7,
    nome: "Xadrez",
    professor: "Treinamento Livre",
    dias: "Quartas e Sextas",
    horario: "18h30 às 21h",
    icon: "♟️",
    descricao: "Jogo estratégico milenar."
}, ];

const noticias = [{
    id: 1,
    titulo: "JICS 2026 - Inscrições Abertas!",
    descricao: "Inscrições abertas para todos os alunos do IFRO. Participe dos Jogos Internos do Campus!"
}, {
    id: 2,
    titulo: "Treinos Iniciados com Sucesso",
    descricao: "Todos os treinos iniciaram com grande participação dos alunos interessados."
}, {
    id: 3,
    titulo: "Novo Professor de Handball",
    descricao: "Bem-vindo Profa. Alyne! Ela será responsável pelos treinos de Handball."
}, ];

let currentUser = null;
let inscriptions = [];
let currentInscription = null;

// ===== FUNCTIONS =====

function togglePassword() {
    const input = document.getElementById('senha');
    input.type = input.type === 'password' ? 'text' : 'password';
}

function handleLogin(event) {
    event.preventDefault();

    const usuario = document.getElementById('usuario').value;
    const senha = document.getElementById('senha').value;

    fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, senha })
        })
        .then(res => {
            if (!res.ok) {
                throw new Error('Resposta inválida do servidor');
            }
            return res.json();
        })
        .then(data => {
            if (!data.sucesso) {
                alert('Matrícula ou senha inválida!');
                return;
            }

            currentUser = data.user;
            showHomePage();

            if (currentUser.role === 'ADMIN') {
                showPage('admin');
            }
        })
        .catch(err => {
            console.error('Erro no login:', err);
            alert('Erro inesperado no login. Tente novamente.');
        });
}


function showHomePage() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('homePage').classList.remove('hidden');

    renderModalities();
    renderNews();
    renderScheduleTable();

    const navbar = document.querySelector('.navbar-nav');

    // 🔹 Remove itens antigos (evita duplicar se relogar)
    navbar.querySelectorAll('.admin-only').forEach(el => el.remove());

    // 🔐 Itens exclusivos do ADMIN
    if (currentUser.role === 'ADMIN') {
        navbar.innerHTML += `
            <li class="admin-only">
                <a class="nav-link" onclick="showPage('editar')">Editar</a>
            </li>
            <li class="admin-only">
                <a class="nav-link" onclick="showPage('admin')">Admin</a>
            </li>
        `;
    }
}

function logout() {
    currentUser = null;
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('homePage').classList.add('hidden');
    document.getElementById('loginForm').reset();
}

function showPage(page) {
    document.querySelectorAll('.page-content').forEach(el =>
        el.classList.add('hidden')
    );
    document.getElementById(page).classList.remove('hidden');

    // Remove active de todos
    document.querySelectorAll('.nav-link').forEach(el =>
        el.classList.remove('active')
    );

    // Ativa o link correspondente
    const linkAtivo = document.querySelector(`.nav-link[onclick*="${page}"]`);
    if (linkAtivo) {
        linkAtivo.classList.add('active');
    }

    if (page === 'perfil') {
        carregarPerfil();
    }
}

function renderModalities() {
    const grid = document.getElementById('modalidadesGrid');
    const allGrid = document.getElementById('allModalidadesGrid');
    const treinosOptions = document.getElementById('treinosOptions');
    const jicsOptions = document.getElementById('jicsOptions');

    const html = modalidades.map(m => `
                <div class="card" onclick="showModalDetails('${m.nome}')">
                    <div class="card-header">
                        <div class="card-icon">${m.icon}</div>
                        <div class="card-title">${m.nome}</div>
                    </div>
                    <div class="card-body">
                        <strong>Professor:</strong>
                        <p>${m.professor}</p>
                        <strong>Horário:</strong>
                        <p>${m.horario}</p>
                    </div>
                </div>
            `).join('');

    grid.innerHTML = html;
    allGrid.innerHTML = html;
    treinosOptions.innerHTML = modalidades.map(m => `
                <div class="card" onclick="subscribeToTraining('${m.nome}')">
                    <div class="card-header">
                        <div class="card-icon">${m.icon}</div>
                        <div class="card-title">${m.nome}</div>
                    </div>
                    <div class="card-body">
                        <button class="btn-primary" style="width: 100%; margin-top: 10px;">Inscrever-se</button>
                    </div>
                </div>
            `).join('');

    jicsOptions.innerHTML = modalidades.map(m => `
                <div class="card" onclick="subscribeToJICS('${m.nome}')">
                    <div class="card-header">
                        <div class="card-icon">${m.icon}</div>
                        <div class="card-title">${m.nome}</div>
                    </div>
                    <div class="card-body">
                        <button class="btn-primary" style="width: 100%; margin-top: 10px;">Inscrever</button>
                    </div>
                </div>
            `).join('');
}

function renderNews() {
    const grid = document.getElementById('noticiasGrid');
    const allGrid = document.getElementById('allNoticiasGrid');

    const html = noticias.map(n => `
                <div class="card">
                    <div class="card-header">
                        <div class="card-icon">📰</div>
                        <div class="card-title">${n.titulo}</div>
                    </div>
                    <div class="card-body">
                        <p>${n.descricao}</p>
                    </div>
                </div>
            `).join('');

    grid.innerHTML = html;
    allGrid.innerHTML = html;
}

function renderScheduleTable() {
    const tbody = document.getElementById('tabelaHorarios');
    const rows = modalidades.map(m => `
                <tr>
                    <td>${m.nome}</td>
                    <td>${m.professor}</td>
                    <td>${m.dias}</td>
                    <td>${m.horario}</td>
                </tr>
            `).join('');
    tbody.innerHTML = rows;
}

function carregarPerfil() {
    if (!currentUser) return;

    document.getElementById('perfilNome').textContent = currentUser.nome;
    document.getElementById('perfilMatricula').textContent = currentUser.matricula;
    document.getElementById('perfilCurso').textContent = currentUser.descricao_curso;
    document.getElementById('perfilTurma').textContent = currentUser.turma;
    document.getElementById('perfilCampus').textContent = currentUser.campus;
    document.getElementById('perfilNascimento').textContent =
        new Date(currentUser.data_nascimento).toLocaleDateString('pt-BR');
    document.getElementById('perfilTelefone').textContent = currentUser.telefone;
    document.getElementById('perfilEmailAcademico').textContent = currentUser.email_academico;
    document.getElementById('perfilEmailPessoal').textContent = currentUser.email_pessoal;
}

function editarSenha() {
    document.getElementById('modalSenha').classList.remove('hidden');
}

function closeModalSenha() {
    document.getElementById('modalSenha').classList.add('hidden');
}

function confirmarAlteracaoSenha() {
    const senhaAtual = document.getElementById('senhaAtualInput').value;
    const novaSenha = document.getElementById('novaSenhaInput').value;

    if (!senhaAtual || !novaSenha) {
        showToastErro('Preencha todos os campos');
        return;
    }

    if (novaSenha.length < 4) {
        showToastErro('A nova senha deve ter no mínimo 4 caracteres');
        return;
    }

    // ✅ GUARDA COMO OBJETO
    senhaPendente = {
        senhaAtual,
        novaSenha
    };

    closeModalSenha();
    document.getElementById('modalConfirmarSenha').classList.remove('hidden');
}


function confirmarTrocaSenha() {
    if (!senhaPendente) return;

    fetch('/alterar-senha', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                matricula: currentUser.matricula,
                senhaAtual: senhaPendente.senhaAtual,
                novaSenha: senhaPendente.novaSenha
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                showToastSucesso();
            } else if (data.tipo === 'senha_atual_incorreta') {
                showToastErro('Senha atual incorreta');
            } else if (data.tipo === 'mesma_senha') {
                showToastErro('Essa senha já está cadastrada!');
            } else {
                showToastErro('Erro ao alterar a senha');
            }

            senhaPendente = null;
            closeModalConfirmar();

            document.getElementById('senhaAtualInput').value = '';
            document.getElementById('novaSenhaInput').value = '';
        })
        .catch(() => {
            showToastErro('Erro ao alterar a senha');
            senhaPendente = null;
            closeModalConfirmar();
        });
}


function showToastSucesso() {
    const toast = document.getElementById('toastSucesso');

    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000); // 3 segundos
}

function showToastErro(mensagem) {
    const toast = document.getElementById('toastErro');
    document.getElementById('toastErroMsg').textContent = mensagem;

    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function closeModalConfirmar() {
    document.getElementById('modalConfirmarSenha').classList.add('hidden');
    senhaPendente = null;
}

function openModal(type) {
    if (type === 'treinos') {
        document.getElementById('modalTreinos').classList.add('show');
    } else if (type === 'jics') {
        document.getElementById('modalJICS').classList.add('show');
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function showModalDetails(modalidadeName) {
    const mod = modalidades.find(m => m.nome === modalidadeName);
    if (mod) {
        currentInscription = mod;
        document.getElementById('detailTitle').textContent = mod.nome;
        document.getElementById('detailContent').innerHTML = `
                    <strong>Professor:</strong>
                    <p>${mod.professor}</p>
                    <strong>Dias de Treino:</strong>
                    <p>${mod.dias}</p>
                    <strong>Horário:</strong>
                    <p>${mod.horario}</p>
                    <strong>Aprenda a Jogar:</strong>
                    <p>${mod.descricao}</p>
                    ${mod.video ? `<iframe width="100%" height="315" src="${mod.video}" style="margin-top: 10px;"></iframe>` : ''}
                `;
                document.getElementById('detailModal').classList.add('show');
            }
        }

function subscribeToTraining(modalidadeName) {
    if (!currentUser) {
        alert('Faça login primeiro!');
        return;
    }
    inscriptions.push({
        nome: currentUser.nome,
        matricula: currentUser.matricula,
        modalidade: modalidadeName,
        tipo: 'Treino',
        data: new Date().toLocaleDateString('pt-BR')
    });
    alert(`Inscrição realizada em ${modalidadeName}!`);
    closeModal('modalTreinos');
    updateInscriptionsTable();
}

function subscribeToJICS(modalidadeName) {
    if (!currentUser) {
        alert('Faça login primeiro!');
        return;
    }
    inscriptions.push({
        nome: currentUser.nome,
        matricula: currentUser.matricula,
        modalidade: modalidadeName,
        tipo: 'JICS 2026',
        data: new Date().toLocaleDateString('pt-BR')
    });
    alert(`Inscrição realizada no JICS para ${modalidadeName}!`);
    closeModal('modalJICS');
    updateInscriptionsTable();
}

function confirmInscription() {
    if (currentUser && currentInscription) {
        subscribeToTraining(currentInscription.nome);
    }
}

function updateInscriptionsTable() {
    const tbody = document.getElementById('tabelaInscricoes');
    if (!tbody) return;

    const rows = inscriptions.map(i => `
        <tr>
            <td>${i.nome}</td>
            <td>${i.matricula}</td>
            <td>${i.modalidade}</td>
            <td>${i.tipo}</td>
            <td>${i.data}</td>
        </tr>
    `).join('');
    tbody.innerHTML = rows;
}

function switchAdminTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    event.target.classList.add('active');
}

function addUser(event) {
    event.preventDefault();

    const aluno = {
        matricula: document.getElementById('newMatricula').value,
        nome: document.getElementById('newNome').value,
        campus: document.getElementById('newCampus').value,
        descricao_curso: document.getElementById('newCurso').value,
        turma: document.getElementById('newTurma').value,
        data_nascimento: document.getElementById('newNascimento').value,
        email_pessoal: document.getElementById('newEmail').value,
        senha: document.getElementById('newSenha').value
    };

    fetch('/admin/add-aluno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aluno)
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            alert(data.mensagem || 'Erro ao cadastrar aluno');
            return;
        }

        alert('✅ Aluno cadastrado com sucesso!');
        event.target.reset();
    })
    .catch(() => {
        alert('Erro ao conectar com o servidor');
    });
}

function addInfo(event) {
    event.preventDefault();
    const type = document.getElementById('infoType').value;
    const titulo = document.getElementById('infoTitulo').value;
    const descricao = document.getElementById('infoDescricao').value;

    if (type === 'noticia') {
        noticias.push({ id: noticias.length + 1, titulo: titulo, descricao: descricao });
        renderNews();
    }
    alert('Informação adicionada com sucesso!');
    event.target.reset();
}

function showNotifications() {
    alert('Você tem 3 notificações:\n1. Novos horários de treino\n2. Inscrições abertas\n3. Próximo evento em 2 semanas');
}

// Initialize
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
}