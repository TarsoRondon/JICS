import express from 'express';
import { conectar } from './testeConexao.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.post('/login', async(req, res) => {
    const { usuario, senha } = req.body;

    try {
        const conexao = await conectar();

        const [rows] = await conexao.query(
            'SELECT matricula, nome, campus, turma, email_academico, email_pessoal, descricao_curso, data_nascimento, telefone FROM alunos WHERE matricula = ? AND senha = ?', [usuario, senha]
        );

        await conexao.end();

        if (rows.length === 0) {
            return res.json({ sucesso: false });
        }

        // 🔐 DEFINIÇÃO DE ROLE CONTROLADA
        const user = rows[0];

        // regra simples
        if (user.matricula === 'ADMIN') {
            user.role = 'ADMIN';
        } else {
            user.role = 'ALUNO';
        }

        res.json({
            sucesso: true,
            user
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false });
    }
});


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

app.post('/admin/add-aluno', async(req, res) => {
    const {
        matricula,
        nome,
        campus,
        descricao_curso,
        turma,
        data_nascimento,
        email_pessoal,
        senha
    } = req.body;

    const cursosCodigo = {
        'Técnico em Informática Integrado ao Ensino Médio': 606,
        'Técnico em Química Integrado ao Ensino Médio': 608,
        'Técnico em Edificações Integrado ao Ensino Médio': 604,
        'Técnico em Eletrotécnica Integrado ao Ensino Médio': 605
    };

    const codigo_curso = cursosCodigo[descricao_curso];

    if (!codigo_curso) {
        return res.json({
            sucesso: false,
            mensagem: 'Curso inválido'
        });
    }


    try {
        const conexao = await conectar();

        // Verifica se matrícula já existe
        const [existe] = await conexao.query(
            'SELECT matricula FROM alunos WHERE matricula = ?', [matricula]
        );

        if (existe.length > 0) {
            await conexao.end();
            return res.json({
                sucesso: false,
                mensagem: 'Matrícula já cadastrada'
            });
        }

        await conexao.query(`
            INSERT INTO alunos
            (matricula, nome, campus, descricao_curso, codigo_curso, turma, data_nascimento, email_pessoal, senha)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            matricula,
            nome,
            campus,
            descricao_curso,
            codigo_curso,
            turma,
            data_nascimento,
            email_pessoal,
            senha
        ]);

        await conexao.end();

        res.json({ sucesso: true });

    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false });
    }
});




app.listen(3000, () => {
    console.log('🚀 Servidor rodando em http://localhost:3000');
});