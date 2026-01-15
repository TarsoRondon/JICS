let senhaPendente = null;
let modalidades = [];
let noticias = [];
let diasModalidades = JSON.parse(localStorage.getItem('diasModalidades')) || {};


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
                icon: m.icone,
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
    const usuarioSalvo = localStorage.getItem('usuarioLogado');

    if (usuarioSalvo) {
        currentUser = JSON.parse(usuarioSalvo); // 🔥 ESSENCIAL

        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('homePage').classList.remove('hidden');

        showHomePage();

        const paginaSalva = localStorage.getItem('paginaAtual') || 'dashboard';

        if (paginaSalva === 'dashboard') {
            abrirDashboard(); // ✅ CARREGA TUDO NO MOMENTO CERTO
        } else if (paginaSalva === 'admin' && currentUser.role !== 'ADMIN') {
            abrirDashboard(); // 🔐 bloqueio
        } else {
            showPage(paginaSalva);
        }

    } else {
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('homePage').classList.add('hidden');
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
                alert('Matrícula ou senha inválida!');
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
            alert('Erro inesperado no login');
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

function logout() {
    // Limpa estado global
    currentUser = null;
    inscriptions = [];
    currentInscription = null;

    // Limpa persistência
    localStorage.removeItem('usuarioLogado');
    localStorage.removeItem('paginaAtual');

    // Limpa UI sensível
    document.querySelectorAll('.admin-only').forEach(el => el.remove());

    // Limpa perfil visualmente
    limparPerfil();

    // Volta para login
    document.getElementById('homePage').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
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

                    <div class="card-actions">
                        <button onclick="verNoticia(${n.id})"> Ver</button>

                        ${
                            currentUser.role === 'ADMIN'
                                ? `
                                    <button onclick="editarNoticia(${n.id})"> Editar</button>
                                    <button onclick="excluirNoticia(${n.id})"> Excluir</button>
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


function showToastSucesso(mensagem) {
    const toast = document.getElementById('toastSucesso');
    document.getElementById('toastSecessoMsg').textContent = mensagem;

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
    atualizarDashboard();
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
    atualizarDashboard();
}

function addModalidade(event) {
    event.preventDefault();

    const titulo = document.getElementById('modalidadeTitulo').value;
    const descricao = document.getElementById('modalidadeDescricao').value;
    const professor = document.getElementById('modalidadeProfessor').value;
    const horaInicio = document.getElementById('horaInicio').value;
    const horaFim = document.getElementById('horaFim').value;
    const icone = document.getElementById('modalidadeIcone').value;

    // 🔹 Dias selecionados
    const diasSelecionados = Array.from(
        document.querySelectorAll('.dias-semana input:checked')
    ).map(el => el.value);

    if (diasSelecionados.length === 0 || diasSelecionados.length > 2) {
        alert('Selecione até 2 dias de treino.');
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
            icone,
            dias // 🔥 enviado só pro front
        })
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            alert('Erro ao cadastrar modalidade');
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
            icon: icone,
            descricao
        });

        alert('🏅 Modalidade cadastrada com sucesso!');
        event.target.reset();

        renderModalities();
        renderScheduleTable();
        atualizarDashboard();
    }); 
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
            <td>${i.turma}</td>
            <td>${i.modalidade}</td>
            <td>${i.sexo}</td>
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
            showToastErro(data.mensagem || 'Erro ao cadastrar aluno');
            return;
        }

        showToastSucesso('✅ Aluno cadastrado com sucesso!');
        event.target.reset();
        carregarInscricoesAdmin()
    })
    .catch(() => {
        showToastErro('Erro ao conectar com o servidor');
    });
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
            alert('Erro ao publicar notícia');
            return;
        }

        alert('📰 Notícia publicada com sucesso!');
        event.target.reset();
        carregarNoticias(); // 🔥 atualiza para todos
    });
}

function showNotifications() {
    alert('Você tem 3 notificações:\n1. Novos horários de treino\n2. Inscrições abertas\n3. Próximo evento em 2 semanas');
}

function carregarInscricoesAdmin() {
    fetch('/admin/inscricoes')
        .then(res => res.json())
        .then(dados => {
            inscriptions = dados.map(i => ({
                nome: i.nome,
                matricula: i.matricula,
                modalidade: i.modalidade || '—',
                tipo: i.tipo,
                data: new Date(i.data_inscricao).toLocaleDateString('pt-BR')
            }));
            updateInscriptionsTable();
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
        alert('Preencha todos os campos.');
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
        alert('Erro ao excluir notícia');
        fecharModalExcluir();
    });
}



// Initialize
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
}