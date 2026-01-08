import express from 'express';
import { conectar } from './testeConexao.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.post('/buscar-aluno', async(req, res) => {
    const { matricula } = req.body;

    try {
        const conexao = await conectar();

        const [rows] = await conexao.query(
            'SELECT nome FROM alunos WHERE matricula = ?', [matricula]
        );

        await conexao.end();

        if (rows.length === 0) {
            return res.json({ erro: 'Aluno não encontrado' });
        }

        res.json({ nome: rows[0].nome });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro no servidor' });
    }
});

app.post('/alterar-senha', async(req, res) => {
    const { matricula, senhaAtual, novaSenha } = req.body;

    try {
        const conexao = await conectar();

        // Buscar senha atual
        const [rows] = await conexao.query(
            'SELECT senha FROM alunos WHERE matricula = ?', [matricula]
        );

        if (rows.length === 0) {
            await conexao.end();
            return res.json({ sucesso: false, tipo: 'erro' });
        }

        // Verifica se a senha atual confere
        if (rows[0].senha !== senhaAtual) {
            await conexao.end();
            return res.json({
                sucesso: false,
                tipo: 'senha_atual_incorreta'
            });
        }

        // Verifica se nova senha é igual à antiga
        if (rows[0].senha === novaSenha) {
            await conexao.end();
            return res.json({
                sucesso: false,
                tipo: 'mesma_senha'
            });
        }

        // Atualiza senha
        await conexao.query(
            'UPDATE alunos SET senha = ? WHERE matricula = ?', [novaSenha, matricula]
        );

        await conexao.end();

        res.json({ sucesso: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false, tipo: 'erro' });
    }
});



app.listen(3000, () => {
    console.log('🚀 Servidor rodando em http://localhost:3000');
});