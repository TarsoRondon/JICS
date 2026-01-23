let senhaPendente = null;
let modalidades = [];
let noticias = [];
let diasModalidades = JSON.parse(localStorage.getItem('diasModalidades')) || {};
const ICONES_MODALIDADES = {
    'Futebol': '⚽',
    'Basquete': '🏀',
    'Vôlei': '🏐',
    'Atletismo': '🏃',
    'Judô': '🥋',
    'Natação': '🏊',
    'Tênis de mesa': '🏓',
    'Musculação': '🏋️'
};
let iconesModalidades = JSON.parse(localStorage.getItem('iconesModalidades')) || {};
let matriculaTimeout = null;


function carregarNoticias() {
    fetch('/noticias')
        .then(res => res.json())
        .then(dados => {
            noticias = dados;
            renderNews(dados);
            atualizarDashboard();
        })
        .catch(() => {
            console.error('Erro ao carregar notícias');
        });
}

function carregarModalidades() {
    fetch('/modalidades')
        .then(res => res.json())
        .then(dados => {
            modalidades = dados.map(m => ({
                id: m.id,
                nome: m.titulo,
                professor: m.professor,
                dias: diasModalidades[m.titulo] || 'A definir',
                horario: formatarHorario(m.hora_inicio, m.hora_fim),
                icon: iconesModalidades[m.titulo] || ICONES_MODALIDADES[m.titulo] || '🏅',
                descricao: m.descricao
            }));

            renderModalities();
            renderScheduleTable();
            atualizarDashboard();
        })
        .catch(() => {
            console.error('Erro ao carregar modalidades');
        });
}

function formatarHorario(inicio, fim) {
    if (!inicio || !fim) return '—';

    const hi = inicio.slice(0, 5).replace(':', 'h');
    const hf = fim.slice(0, 5).replace(':', 'h');

    return `${hi} às ${hf}`;
}

let currentUser = null;
let inscriptions = [];
let currentInscription = null;


document.addEventListener('DOMContentLoaded', () => {
    // 🔹 carrega dados iniciais
    carregarNoticias();
    carregarModalidades();
    document.querySelectorAll('.user-name').forEach(el => {
        el.textContent = currentUser.nome;
    });

    const usuarioSalvo = localStorage.getItem('usuarioLogado');

    if (usuarioSalvo) {
        currentUser = JSON.parse(usuarioSalvo);

        document.getElementById('userName').textContent = currentUser.nome;

        const foto = currentUser.foto || 'assets/avatar-default.png';
        atualizarAvatar(foto);
    }


    if (usuarioSalvo) {
        currentUser = JSON.parse(usuarioSalvo);

        // 👤 nome do usuário
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = currentUser.nome;

        // 👤 avatar
        carregarAvatar();

        // 📄 dados do perfil
        document.getElementById('perfilNome').textContent = currentUser.nome;
        document.getElementById('perfilMatricula').textContent = currentUser.matricula;
        document.getElementById('perfilCurso').textContent = currentUser.descricao_curso;
        document.getElementById('perfilTurma').textContent = currentUser.turma;
        document.getElementById('perfilCampus').textContent = currentUser.campus;
        document.getElementById('perfilNascimento').textContent = currentUser.data_nascimento;
        document.getElementById('perfilEmailPessoal').textContent = currentUser.email_pessoal;

        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('homePage').classList.remove('hidden');

        showHomePage();

        const paginaSalva = localStorage.getItem('paginaAtual') || 'dashboard';

        if (paginaSalva === 'admin' && currentUser.role !== 'ADMIN') {
            showPage('dashboard');
        } else {
            showPage(paginaSalva);
        }

    } else {
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('homePage').classList.add('hidden');
    }

    // 🖼️ avatar upload
    const avatar = document.getElementById('userAvatar');
    const upload = document.getElementById('uploadAvatar');

    if (avatar && upload) {
        avatar.addEventListener('click', () => upload.click());

        upload.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                avatar.src = reader.result;

                currentUser.foto = reader.result;
                localStorage.setItem(
                    'usuarioLogado',
                    JSON.stringify(currentUser)
                );
            };
            reader.readAsDataURL(file);
        });
    }
});



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
        .then(res => res.json())
        .then(data => {
            if (!data.sucesso) {
                showToastErro('Matrícula ou senha inválida!');
                return;
            }

            // 🔥 ESTADO LIMPO
            currentUser = data.user;
            inscriptions = [];
            currentInscription = null;

            // 🔥 RESET DE NAVEGAÇÃO
            localStorage.setItem('usuarioLogado', JSON.stringify(data.user));
            localStorage.setItem('paginaAtual', 'dashboard'); // ← ESSENCIAL

            showHomePage();
            abrirDashboard(); // ← força ponto inicial correto
        })
        .catch(() => {
            showToastErro('Erro inesperado no login');
        });
}

function abrirDashboard() {
    showPage('dashboard');

    carregarNoticias();
    carregarModalidades();
    carregarInscricoesAdmin(); // se quiser refletir inscritos
}



function showHomePage() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('homePage').classList.remove('hidden');

    const navbar = document.querySelector('.navbar-nav');

    // 🔹 Remove itens antigos (evita duplicar se relogar)
    navbar.querySelectorAll('.admin-only').forEach(el => el.remove());

    // 🔐 Itens exclusivos do ADMIN
    if (currentUser.role === 'ADMIN') {
        navbar.innerHTML += `
            <li class="admin-only">
                <a class="nav-link" onclick="showPage('admin')">Editar</a>
            </li>
        `;
    }
}

function carregarAvatar() {
    const avatar = document.getElementById('userAvatar');
    if (!avatar || !currentUser) return;

    avatar.src = currentUser.foto ?
        currentUser.foto :
        'assets/avatar-default.png';
}

function toggleUserMenu() {
    document.getElementById('userDropdown').classList.toggle('hidden');
}



function atualizarAvatar(src) {
    document.getElementById('userPhoto').src = src;
    document.getElementById('userAvatar').src = src;
}

function toggleConfigPanel() {
    document.getElementById('configPanel').classList.toggle('hidden');
}

function toggleConfigItem(item) {
    const panel = item.nextElementSibling;
    item.classList.toggle('open');
    panel.classList.toggle('open');
}


const fotoSalva = localStorage.getItem('fotoUsuario');
if (fotoSalva) {
    userPhoto.src = fotoSalva;
    document.getElementById("userPhoto").src = fotoSalva;
    document.getElementById("userAvatar").src = fotoSalva;

}

const avatar = document.getElementById('userAvatar');
const upload = document.getElementById('uploadAvatar');
const uploadIcon = document.querySelector('.upload-icon');

if (avatar && upload && uploadIcon) {
    avatar.addEventListener('click', () => upload.click());
    uploadIcon.addEventListener('click', () => upload.click());

    upload.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            avatar.src = reader.result;
            currentUser.foto = reader.result;
            localStorage.setItem('usuarioLogado', JSON.stringify(currentUser));
        };
        reader.readAsDataURL(file);
    });
}
/////////////CETA ANIMADA///////////////////////////

function toggleSubmenu(id, element) {
    const submenu = document.getElementById(id);
    submenu.classList.toggle('hidden');

    if (element) {
        element.classList.toggle('open');
    }
}


///////////////////////////////////////////////////////

function logout() {
    // limpa apenas o usuário
    localStorage.removeItem('usuarioLogado');
    localStorage.removeItem('paginaAtual');

    // limpa estado em memória
    currentUser = null;
    inscriptions = [];
    currentInscription = null;

    // recarrega a página
    location.reload();
}


function limparPerfil() {
    const campos = [
        'perfilNome',
        'perfilMatricula',
        'perfilCurso',
        'perfilTurma',
        'perfilCampus',
        'perfilNascimento',
        'perfilTelefone',
        'perfilEmailAcademico',
        'perfilEmailPessoal'
    ];

    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });
}

function showPage(page) {
    if (!currentUser) return; // 🔐 segurança

    document.querySelectorAll('.page-content').forEach(el =>
        el.classList.add('hidden')
    );

    document.getElementById(page).classList.remove('hidden');

    document.querySelectorAll('.nav-link').forEach(el =>
        el.classList.remove('active')
    );

    const linkAtivo = document.querySelector(`.nav-link[onclick*="${page}"]`);
    if (linkAtivo) linkAtivo.classList.add('active');

    localStorage.setItem('paginaAtual', page);

    // 🔥 ORDEM GARANTIDA
    if (page === 'perfil') {
        limparPerfil();
        carregarPerfil();
    }

    if (page === 'admin') {
        carregarInscricoesAdmin();
    }

    if (page === 'noticias') {
        carregarNoticias();
    }

    if (page === 'modalidades' || page === 'horarios') {
        carregarModalidades(); // ← 🔥 ESSENCIAL
    }
}

function renderModalities() {
    const grid = document.getElementById('modalidadesGrid');
    const allGrid = document.getElementById('allModalidadesGrid');
    const treinosOptions = document.getElementById('treinosOptions');
    const jicsOptions = document.getElementById('jicsOptions');

    const html = modalidades.map(m => `
                <div class="card" onclick="showModalDetails('${m.id}')">
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
                <div class="card" onclick="showModalDetails('${m.id}')">
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

function renderNews(noticias) {
    const grid = document.getElementById('noticiasGrid'); // dashboard
    const allGrid = document.getElementById('allNoticiasGrid'); // página de notícias

    if (!noticias || noticias.length === 0) {
        if (allGrid) allGrid.innerHTML = '<p>Nenhuma notícia publicada.</p>';
        if (grid) grid.innerHTML = '';
        return;
    }

    const noticiasOrdenadas = [...noticias].sort(
        (a, b) => new Date(b.data_publicacao) - new Date(a.data_publicacao)
    );

    // =========================
    // 📰 TODAS AS NOTÍCIAS
    // =========================
    const htmlAll = noticiasOrdenadas.map(n => `
        <div class="card">
            <div class="card-header">
                <div class="card-icon">📰</div>
                <div class="card-title">${n.titulo}</div>
            </div>

            <div class="card-body">
                <p>${n.descricao}</p>

                <small>
                    ${new Date(n.data_publicacao).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                    }).replace(',', ' às')}
                </small>

                ${
                    n.data_edicao
                        ? `
                            <br>
                            <small class="edited">
                                ✏️ Editado em:
                                ${new Date(n.data_edicao).toLocaleString('pt-BR', {
                                    dateStyle: 'short',
                                    timeStyle: 'short'
                                }).replace(',', ' às')}
                            </small>
                        `
                        : ''
                }

                <div class="card-actions">
                    <button onclick="verNoticia(${n.id})" class="botao-noticias"> Ver</button>

                    ${
                        currentUser.role === 'ADMIN'
                            ? `
                                <button onclick="editarNoticia(${n.id})" class="botao-noticias"> Editar</button>
                                <button onclick="excluirNoticia(${n.id})" class="botao-noticias"> Excluir</button>
                              `
                            : ''
                    }
                </div>
            </div>
        </div>
    `).join('');

    // =========================
    // 🧩 DASHBOARD (3 ÚLTIMAS)
    // =========================
    const htmlDashboard = noticiasOrdenadas
        .slice(0, 3)
        .map(n => `
            <div class="card">
                <div class="card-header">
                    <div class="card-icon">📰</div>
                    <div class="card-title">${n.titulo}</div>
                </div>

                <div class="card-body">
                    <p>${n.descricao}</p>

                    <small>
                        ${new Date(n.data_publicacao).toLocaleString('pt-BR', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                        }).replace(',', ' às')}
                    </small>

                    ${
                        n.data_edicao
                            ? `
                                <br>
                                <small class="edited">
                                    ✏️ Editado em:
                                    ${new Date(n.data_edicao).toLocaleString('pt-BR', {
                                        dateStyle: 'short',
                                        timeStyle: 'short'
                                    }).replace(',', ' às')}
                                </small>
                            `
                            : ''
                    }

                    <div class="botao-">
                        <button onclick="verNoticia(16)" class="botao-noticias"> Ver</button>

                        ${
                            currentUser.role === 'ADMIN'
                                ? `
                                    <button onclick="editarNoticia(${n.id})"class="botao-noticias"> Editar</button>
                                    <button onclick="excluirNoticia(${n.id})"class="botao-noticias"> Excluir</button>
                                  `
                                : ''
                        }
                    </div>
                </div>
            </div>
        `).join('');

    if (allGrid) allGrid.innerHTML = htmlAll;
    if (grid) grid.innerHTML = htmlDashboard;
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

    limparPerfil();

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
                showToastSucesso(mensagem);
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

function alterarFoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {
        const novaFoto = e.target.result;

        // Atualiza os dois avatares
        document.getElementById("userPhoto").src = novaFoto;
        document.getElementById("userAvatar").src = novaFoto;

        // (opcional) salvar no localStorage
        localStorage.setItem("fotoUsuario", novaFoto);
    };

    reader.readAsDataURL(file);
}


function showToastSucesso(mensagem) {
    const toast = document.getElementById('toastSucesso');
    document.getElementById('toastSucessoMsg').textContent = mensagem;

    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 5000); // 3 segundos
}

function showToastErro(mensagem) {
    const toast = document.getElementById('toastErro');
    document.getElementById('toastErroMsg').textContent = mensagem;

    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 5000);
}
function mostrarToastAtencao(mensagem, tempo = 3000) {
    const toast = document.getElementById('toastAtencao');
    const msg = document.getElementById('toastAtencaoMsg');
    const timer = toast.querySelector('.toast-timer');

    msg.textContent = mensagem;

    toast.classList.remove('hidden');
    toast.style.animation = 'slideDown 0.4s ease';

    // reset da barra de tempo
    timer.style.animation = 'none';
    timer.offsetHeight;
    timer.style.animation = `timer ${tempo / 1000}s linear forwards`;

    setTimeout(() => {
        toast.style.animation = 'slideOutUp 0.3s ease forwards';

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 300);

    }, tempo);
}


function closeModalConfirmar() {
    document.getElementById('modalConfirmarSenha').classList.add('hidden');
    senhaPendente = null;
}

function openModal(type) { //ESSA FUNÇÃO NÃO ESTÁ MAIS SENDO USADA
    if (type === 'treinos') {
        document.getElementById('modalTreinos').classList.add('show');
    } else if (type === 'jics') {
        document.getElementById('modalJICS').classList.add('show');
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function showModalDetails(modalidadeId) {
    const mod = modalidades.find(m => String(m.id) === String(modalidadeId));
    if (!mod) {
        showToastErro('Modalidade não encontrada');
        return;
    }

    currentInscription = mod;

    document.getElementById('detailTitle').textContent = mod.nome;
    document.getElementById('detailContent').innerHTML = `
        <strong>Professor:</strong>
        <p>${mod.professor}</p>
        <strong>Dias:</strong>
        <p>${mod.dias}</p>
        <strong>Horário:</strong>
        <p>${mod.horario}</p>
        <strong>Descrição:</strong>
        <p>${mod.descricao}</p>
    `;

    document.getElementById('detailModal').classList.add('show');
}

function subscribeToJICS(modalidadeId) {
    if (!currentUser) {
        mostrarToastAtencao('Faça login primeiro!');
        return;
    }

    fetch('/inscricoes/jics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            aluno_id: currentUser.id,
            modalidade_id: modalidadeId
        })
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            mostrarToastAtencao(data.mensagem);
            return;
        }

        showToastSucesso('✅ Inscrição realizada com sucesso!');
        closeModal('modalJICS');

        // recarrega do banco
        carregarInscricoesAdmin();
    })
    .catch(() => {
        showToastErro('Erro ao realizar inscrição');
    });
}

function confirmInscription() {
    if (!currentUser) {
        mostrarToastAtencao('Faça login para se inscrever.');
        return;
    }

    if (!currentInscription) {
        mostrarToastAtencao('Nenhuma modalidade selecionada.');
        return;
    }

    subscribeToJICS(currentInscription.id);
}

function addModalidade(event) {
    event.preventDefault();

    const titulo = document.getElementById('modalidadeTitulo').value;
    const descricao = document.getElementById('modalidadeDescricao').value;
    const professor = document.getElementById('modalidadeProfessor').value;
    const horaInicio = document.getElementById('horaInicio').value;
    const horaFim = document.getElementById('horaFim').value;
    const iconeSelecionado = document.getElementById('modalidadeIcone').value;

    
    iconesModalidades[titulo] = iconeSelecionado;
    localStorage.setItem('iconesModalidades', JSON.stringify(iconesModalidades));

    // 🔹 Dias selecionados
    const diasSelecionados = Array.from(
        document.querySelectorAll('.dias-semana input:checked')
    ).map(el => el.value);

    if (diasSelecionados.length === 0 || diasSelecionados.length > 2) {
        mostrarToastAtencao('Selecione até 2 dias de treino.');
        return;
    }

    const dias = diasSelecionados.join(' e '); // "Segunda e Quinta"

    fetch('/admin/modalidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            titulo,
            descricao,
            professor,
            hora_inicio: horaInicio,
            hora_fim: horaFim,
            dias // 🔥 enviado só pro front
        })
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            showToastErro('Erro ao cadastrar modalidade');
            return;
        }
        diasModalidades[titulo] = dias;
        localStorage.setItem('diasModalidades', JSON.stringify(diasModalidades));
   
        modalidades.push({
            id: Date.now(), // id temporário
            nome: titulo,
            professor,
            dias, // 👈 AGORA EXISTE
            horario: formatarHorario(horaInicio, horaFim),
            icon: iconeSelecionado,
            descricao
        });

        showToastSucesso('🏅 Modalidade cadastrada com sucesso!');
        event.target.reset();

        renderModalities();
        renderScheduleTable();
        atualizarDashboard();
    }); 
}

function carregarInscricoesAdmin() {
    fetch('/inscricoes/jics')
        .then(res => res.json())
        .then(data => {
            inscriptions = data;
            updateInscriptionsTable();
            atualizarDashboard();
        })
        .catch(() => {
            console.error('Erro ao carregar inscrições');
        });
}

function updateInscriptionsTable() {
    const tbody = document.getElementById('tabelaInscricoes');
    if (!tbody) return;

    tbody.innerHTML = inscriptions.map(i => `
        <tr>
            <td>${i.nome}</td>
            <td>${i.matricula}</td>
            <td>${i.turma}</td>
            <td>${i.modalidade}</td>
            <td>${i.sexo}</td>
            <td>${i.tipo}</td>
            <td>${i.data}</td>
        </tr>
    `).join('');
}

function switchAdminTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    event.target.classList.add('active');
}

function addUser(event) {
    event.preventDefault();

    const matriculaInput = document.getElementById('newMatricula');

    // 🚫 BLOQUEIA SE MATRÍCULA JÁ EXISTE
    if (matriculaInput.classList.contains('input-erro')) {
        showToastErro('Corrija a matrícula antes de cadastrar');
        matriculaInput.focus();
        return;
    }

    // 🚫 BLOQUEIA SE AINDA NÃO FOI VALIDADA (opcional, mas recomendado)
    if (!matriculaInput.classList.contains('input-ok')) {
        showToastErro('A matrícula deve conter 13 caracteres');
        matriculaInput.focus();
        return;
    }

    const aluno = {
        matricula: matriculaInput.value,
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
            showToastErro(data.mensagem || 'Erro ao cadastrar aluno');
            return;
        }

        showToastSucesso('✅ Aluno cadastrado com sucesso!');
        event.target.reset();
        resetCustomSelects()
    })
    .catch(() => {
        showToastErro('Erro ao conectar com o servidor');
    });
}

function verificarMatriculaAutomatica(matricula) {
    const input = document.getElementById('newMatricula');
    const status = document.getElementById('matriculaStatus');

    fetch(`/admin/verificar-matricula/${matricula}`)
        .then(res => res.json())
        .then(data => {
            if (data.existe) {
                input.classList.add('input-erro');
                input.classList.remove('input-ok');

                status.textContent = '⚠️ Esta matrícula já possui cadastro';
                status.className = 'mensagem-erro';
                status.style.display = 'block';
            } else {
                input.classList.add('input-ok');
                input.classList.remove('input-erro');

                status.textContent = '';
                status.style.display = 'none';
            }
        })
        .catch(() => {
            resetMatriculaStatus();
        });
}

function resetMatriculaStatus() {
    const input = document.getElementById('newMatricula');
    const status = document.getElementById('matriculaStatus');

    input.classList.remove('input-erro', 'input-ok');
    status.textContent = '';
    status.style.display = 'none';
}

function onMatriculaInput() {
    const input = document.getElementById('newMatricula');
    const valor = input.value.replace(/\D/g, ''); // só números

    input.value = valor; // impede letras

    resetMatriculaStatus();

    // Ainda não tem 13 dígitos → não consulta
    if (valor.length !== 13) {
        return;
    }

    // Debounce: espera o usuário parar de digitar
    clearTimeout(matriculaTimeout);

    matriculaTimeout = setTimeout(() => {
        verificarMatriculaAutomatica(valor);
    }, 500); // 500ms é o ideal
}

function addNoticia(event) {
    event.preventDefault();
    const titulo = document.getElementById('infoTitulo').value;
    const descricao = document.getElementById('infoDescricao').value;

    fetch('/admin/noticias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, descricao })
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            showToastErro('Erro ao publicar notícia');
            return;
        }

        showToastSucesso('📰 Notícia publicada com sucesso!');
        event.target.reset();
        carregarNoticias(); // 🔥 atualiza para todos
    });
}




function atualizarDashboard() {
    const totalModalidades = modalidades.length;
    const totalNoticias = noticias.length;
    const totalInscritos = inscriptions.length;

    document.getElementById('totalModalidades').textContent = totalModalidades;
    document.getElementById('totalNoticias').textContent = totalNoticias;
    document.getElementById('totalInscritos').textContent = totalInscritos;
}

//função de noticias 

function verNoticia(id) {
    const noticia = noticias.find(n => n.id === id);
    if (!noticia) return;

    document.getElementById('verTitulo').textContent = noticia.titulo;
    document.getElementById('verDescricao').textContent = noticia.descricao;

    document.getElementById('verPublicacao').textContent =
        '📅 Publicado em: ' +
        new Date(noticia.data_publicacao).toLocaleString('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short'
        }).replace(',', ' às');

    if (noticia.data_edicao) {
        document.getElementById('verEdicao').textContent =
            '✏️ Editado em: ' +
            new Date(noticia.data_edicao).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short'
            }).replace(',', ' às');
    } else {
        document.getElementById('verEdicao').textContent = '';
    }

    document.getElementById('modalVerNoticia').classList.add('show');
}

function fecharModalVer() {
    document.getElementById('modalVerNoticia').classList.remove('show');
}


function editarNoticia(id) {
    if (currentUser.role !== 'ADMIN') return;

    const noticia = noticias.find(n => n.id === id);
    if (!noticia) return;

    document.getElementById('editNoticiaId').value = noticia.id;
    document.getElementById('editTitulo').value = noticia.titulo;
    document.getElementById('editDescricao').value = noticia.descricao;

    document.getElementById('modalEditarNoticia').classList.add('show');
}
function fecharModalEditar() {
    document.getElementById('modalEditarNoticia').classList.remove('show');
}
function salvarEdicaoNoticia() {
    const id = document.getElementById('editNoticiaId').value;
    const titulo = document.getElementById('editTitulo').value.trim();
    const descricao = document.getElementById('editDescricao').value.trim();

    if (!titulo || !descricao) {
        mostrarToastAtencao('Preencha todos os campos.');
        return;
    }

    fetch(`/noticias/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ titulo, descricao })
    })
    .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
    })
    .then(noticiaAtualizada => {
        // Atualiza no array local
        const index = noticias.findIndex(n => n.id == id);
        if (index !== -1) {
            noticias[index] = noticiaAtualizada;
        }

        renderNews(noticias);
        fecharModalEditar();
        showToastSucesso("Alteração feita com Sucesso");
        carregarNoticias();
    })
    .catch(() => {
        showToastErro('Erro ao salvar edição');
    });
}


let noticiaParaExcluir = null;

function excluirNoticia(id) {
    if (currentUser.role !== 'ADMIN') return;

    noticiaParaExcluir = id;
    document.getElementById('modalExcluir').classList.add('show');
}

function fecharModalExcluir() {
    noticiaParaExcluir = null;
    document.getElementById('modalExcluir').classList.remove('show');
}

function confirmarExclusao() {
    fetch(`/noticias/${noticiaParaExcluir}`, {
        method: 'DELETE'
    })
    .then(res => {
        if (!res.ok) throw new Error();

        noticias = noticias.filter(n => n.id !== noticiaParaExcluir);
        renderNews(noticias);
        fecharModalExcluir();
    })
    .catch(() => {
        showToastErro('Erro ao excluir notícia');
        fecharModalExcluir();
    });
}

//SELECT DE TURMA
document.querySelectorAll('.custom-select').forEach(select => {
    const selected = select.querySelector('.custom-selected');
    const label = selected.querySelector('.label');
    const options = select.querySelectorAll('.custom-option');
    const inputId = select.dataset.input || select.dataset.target;

    selected.addEventListener('click', e => {
        e.stopPropagation();

        document.querySelectorAll('.custom-select').forEach(s => {
            if (s !== select) s.classList.remove('open');
        });

        select.classList.toggle('open');
    });

    options.forEach(option => {
        option.addEventListener('click', () => {
            label.textContent = option.textContent;
            document.getElementById(inputId).value = option.dataset.value;

            select.classList.remove('open');
            select.classList.add('filled');
        });
    });
});

// fecha ao clicar fora
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select')
        .forEach(s => s.classList.remove('open'));
});

function resetCustomSelects() {
    document.querySelectorAll('.custom-select').forEach(select => {
        const label = select.querySelector('.custom-selected .label');

        if (label) {
            label.textContent = 'Selecione...';
        }

        select.classList.remove('open');
        select.classList.remove('filled');
    });

    document.querySelectorAll('input[type="hidden"]').forEach(input => {
        input.value = '';
    });
}
//FIM DO SELECT DE TURMA

let fotoTemp = null;

function alterarFoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {
        fotoTemp = e.target.result;

        document.getElementById("previewFoto").src = fotoTemp;
        document.getElementById("modalPreviewFoto").classList.remove("hidden");
    };

    reader.readAsDataURL(file);
}

function salvarFoto() {
    if (!fotoTemp) return;

    document.getElementById("userPhoto").src = fotoTemp;
    document.getElementById("userAvatar").src = fotoTemp;

    localStorage.setItem("fotoUsuario", fotoTemp);

    fecharPreviewFoto();
}

function fecharPreviewFoto() {
    document.getElementById("modalPreviewFoto").classList.add("hidden");
    fotoTemp = null;
}


// Initialize

const userTrigger = document.getElementById('userTrigger');
const userDropdown = document.getElementById('userDropdown');
const userMenu = document.getElementById('userMenu');

userTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown.classList.toggle('hidden');
});

// 🔒 NÃO fecha ao clicar dentro do menu
userDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
});

// 🔻 fecha apenas clicando fora
document.addEventListener('click', () => {
    userDropdown.classList.add('hidden');
});