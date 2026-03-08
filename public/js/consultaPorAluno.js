function buscarAlunoPorNome() {
  const nome = document.getElementById('buscaNome')?.value.trim();
  const nascimento = document.getElementById('buscaNascimento')?.value;
  const container = document.getElementById('resultadoBusca');

  if (!nome || !nascimento) {
    if (container) container.innerHTML = '<p class="muted">Informe nome completo e data de nascimento.</p>';
    return;
  }

  fetch('/admin/buscar-aluno', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, data_nascimento: nascimento })
  })
    .then(res => res.json())
    .then(data => {
      if (!container) return;
      if (!data || data.length === 0) {
        container.innerHTML = '<p class="muted">Nenhum aluno encontrado.</p>';
        return;
      }

      container.innerHTML = data.map(aluno => {
        const payload = encodeURIComponent(JSON.stringify(aluno));
        return `
          <div class="search-result">
            <div>
              <strong>${aluno.nome}</strong><br />
              <small>Matricula: ${aluno.matricula}</small>
            </div>
            <div class="search-actions">
              <button class="btn-outline" onclick="verPerfilAlunoEncontrado('${payload}')">Ver perfil</button>
              <button class="btn-outline" onclick="preencherAlunoSelecionado('${payload}')">Selecionar</button>
            </div>
          </div>
        `;
      }).join('');
    })
    .catch(() => {
      if (container) container.innerHTML = '<p class="muted">Erro ao buscar aluno.</p>';
    });
}

function preencherAlunoSelecionado(payload) {
  try {
    const aluno = JSON.parse(decodeURIComponent(payload));
    preencherAluno(aluno);
  } catch (err) {
    console.error('Erro ao carregar aluno', err);
  }
}

function preencherAluno(aluno) {
  document.getElementById('newNome').value = aluno.nome || '';
  document.getElementById('newMatricula').value = aluno.matricula || '';
  document.getElementById('newCampus').value = aluno.campus || '';
  document.getElementById('newCurso').value = aluno.descricao_curso || '';
  document.getElementById('newTurma').value = aluno.turma || '';
  document.getElementById('newNascimento').value = aluno.data_nascimento || '';
  document.getElementById('newEmail').value = aluno.email_pessoal || '';
}

let alunoSelecionado = null;

function notifyAlunoErro(message) {
  const msg = String(message || 'Ocorreu um erro.');
  if (typeof window.showToastErro === 'function') {
    window.showToastErro(msg);
    return;
  }
  if (typeof window.toast === 'function') {
    window.toast(msg, 'err');
    return;
  }
  const container = document.getElementById('resultadoBusca');
  if (container) container.innerHTML = `<p class="muted">${msg}</p>`;
}

function verPerfilAlunoEncontrado(payload) {
  try {
    const aluno = JSON.parse(decodeURIComponent(payload));
    if (!aluno || !aluno.matricula) return;

    fetch(`/admin/aluno/${aluno.matricula}`)
      .then(res => res.json())
      .then(data => {
        if (data.erro) {
          notifyAlunoErro(data.erro);
          return;
        }
        alunoSelecionado = data;
        preencherPerfilAluno(data);
      })
      .catch(() => notifyAlunoErro('Erro ao carregar perfil.'));
  } catch (err) {
    console.error(err);
  }
}

function preencherPerfilAluno(aluno) {
  const perfil = document.getElementById('alunoPerfil');
  const edicao = document.getElementById('alunoEdicao');
  if (perfil) perfil.classList.remove('hidden');
  if (edicao) edicao.classList.add('hidden');

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '-';
  };

  set('alunoNome', aluno.nome);
  set('alunoMatricula', aluno.matricula);
  set('alunoCurso', aluno.descricao_curso);
  set('alunoTurma', aluno.turma);
  set('alunoCampus', aluno.campus);
  set('alunoNascimento', aluno.data_nascimento ? new Date(aluno.data_nascimento).toLocaleDateString('pt-BR') : '-');
  set('alunoEmailAcademico', aluno.email_academico);
  set('alunoEmailPessoal', aluno.email_pessoal);
  set('alunoTelefone', aluno.telefone);
  set('alunoSexo', aluno.sexo);
  set('alunoRole', aluno.role);
}

function habilitarEdicaoAluno() {
  if (!alunoSelecionado) return;
  const perfil = document.getElementById('alunoPerfil');
  const edicao = document.getElementById('alunoEdicao');
  if (perfil) perfil.classList.add('hidden');
  if (edicao) edicao.classList.remove('hidden');

  document.getElementById('editNome').value = alunoSelecionado.nome || '';
  document.getElementById('editCampus').value = alunoSelecionado.campus || '';
  document.getElementById('editCurso').value = alunoSelecionado.descricao_curso || '';
  document.getElementById('editTurma').value = alunoSelecionado.turma || '';
  document.getElementById('editNascimento').value = alunoSelecionado.data_nascimento || '';
  document.getElementById('editEmailAcademico').value = alunoSelecionado.email_academico || '';
  document.getElementById('editEmailPessoal').value = alunoSelecionado.email_pessoal || '';
  document.getElementById('editTelefone').value = alunoSelecionado.telefone || '';
  document.getElementById('editSexo').value = alunoSelecionado.sexo || 'M';
  const roleSelect = document.getElementById('editRole');
  if (roleSelect) roleSelect.value = alunoSelecionado.role || 'ALUNO';
}

function salvarEdicaoAluno(event) {
  event.preventDefault();
  if (!alunoSelecionado) return;

  const payload = {
    nome: document.getElementById('editNome').value,
    campus: document.getElementById('editCampus').value,
    descricao_curso: document.getElementById('editCurso').value,
    turma: document.getElementById('editTurma').value,
    data_nascimento: document.getElementById('editNascimento').value,
    email_academico: document.getElementById('editEmailAcademico').value,
    email_pessoal: document.getElementById('editEmailPessoal').value,
    telefone: document.getElementById('editTelefone').value,
    sexo: document.getElementById('editSexo').value
  };

  const roleSelect = document.getElementById('editRole');
  if (roleSelect && roleSelect.value) payload.role = roleSelect.value;

  fetch(`/admin/aluno/${alunoSelecionado.matricula}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (!data.sucesso) {
        notifyAlunoErro('Erro ao salvar alteracoes.');
        return;
      }
      alunoSelecionado = { ...alunoSelecionado, ...payload };
      preencherPerfilAluno(alunoSelecionado);
    })
    .catch(() => notifyAlunoErro('Erro ao salvar alteracoes.'));
}


