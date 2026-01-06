async function buscarAluno() {
    const matricula = document.getElementById('matricula').value;

    const resposta = await fetch('/buscar-aluno', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            matricula
        })
    });

    const dados = await resposta.json();

    const resultado = document.getElementById('resultado');

    if (dados.erro) {
        resultado.textContent = dados.erro;
    } else {
        resultado.textContent = 'Nome do aluno: ' + dados.nome;
    }
}