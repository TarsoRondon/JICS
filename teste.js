import { conectar } from './testeConexao.js';

async function testarSelect() {
    try {
        const conexao = await conectar();

        const [rows] = await conexao.query('SELECT nome FROM alunos WHERE matricula = 2024106060045');
        console.log('📋 Alunos:');
        console.log(rows);

        await conexao.end();
    } catch (erro) {
        console.error('❌ Erro:');
        console.error(erro.message);
    }
}

testarSelect();