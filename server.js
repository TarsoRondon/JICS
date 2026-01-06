import express from 'express';
import { conectar } from './testeConexao.js';

const app = express();

app.use(express.json());
app.use(express.static('public'));

app.post('/buscar-aluno', async(req, res) => {
    const { matricula } = req.body;

    const conexao = await conectar();
    const [rows] = await conexao.query(
        'SELECT nome FROM alunos WHERE matricula = ?', [matricula]
    );
    await conexao.end();

    if (rows.length === 0) {
        return res.json({ erro: 'Aluno não encontrado' });
    }

    res.json({ nome: rows[0].nome });
});

app.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});