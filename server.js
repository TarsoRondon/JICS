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
            'SELECT matricula, nome, campus, turma, email_academico, email_pessoal, descricao_curso, data_nascimento, telefone FROM alunos WHERE matricula = ? AND senha = SHA2(?, 256)', [usuario, senha]
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

        // 1️⃣ Verifica se a senha atual está correta
        const [confere] = await conexao.query(
            `SELECT matricula FROM alunos
             WHERE matricula = ?
               AND senha = SHA2(?, 256)`, [matricula, senhaAtual]
        );

        if (confere.length === 0) {
            await conexao.end();
            return res.json({
                sucesso: false,
                tipo: 'senha_atual_incorreta'
            });
        }

        // 2️⃣ Evita senha igual à anterior
        const [mesma] = await conexao.query(
            `SELECT matricula FROM alunos
             WHERE matricula = ?
               AND senha = SHA2(?, 256)`, [matricula, novaSenha]
        );

        if (mesma.length > 0) {
            await conexao.end();
            return res.json({
                sucesso: false,
                tipo: 'mesma_senha'
            });
        }

        // 3️⃣ Atualiza a senha
        await conexao.query(
            `UPDATE alunos
             SET senha = SHA2(?, 256)
             WHERE matricula = ?`, [novaSenha, matricula]
        );

        await conexao.end();
        res.json({ sucesso: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false });
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, SHA2(?, 256))
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

        await conexao.query(`
            INSERT INTO inscricoes (matricula, nome, modalidade, tipo)
            VALUES (?, ?, ?, ?)
        `, [
            matricula,
            nome,
            null,
            'Cadastro pelo ADMIN'
        ]);

        await conexao.end();

        res.json({ sucesso: true });

    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false });
    }
});

app.get('/admin/inscricoes', async(req, res) => {
    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(`
            SELECT matricula, nome, modalidade, tipo, data_inscricao
            FROM inscricoes
            ORDER BY data_inscricao DESC
        `);
        await conexao.end();
        res.json(rows);
    } catch (err) {
        res.status(500).json([]);
    }
});

app.post('/admin/noticias', async(req, res) => {
    const { titulo, descricao } = req.body;

    if (!titulo || !descricao) {
        return res.status(400).json({ sucesso: false });
    }

    try {
        const conexao = await conectar();

        await conexao.query(
            'INSERT INTO noticias (titulo, descricao) VALUES (?, ?)', [titulo, descricao]
        );

        await conexao.end();

        res.json({ sucesso: true });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false });
    }
});

app.get('/noticias', async(req, res) => {
    try {
        const conexao = await conectar();

        const [rows] = await conexao.query(
            'SELECT * FROM noticias ORDER BY data_publicacao DESC'
        );

        await conexao.end();

        res.json(rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json([]);
    }
});


app.post('/admin/modalidades', async(req, res) => {
    const { titulo, descricao, professor, hora_inicio, hora_fim, icone } = req.body;

    if (!titulo || !descricao || !professor || !hora_inicio || !hora_fim || !icone) {
        return res.json({ sucesso: false });
    }

    try {
        const conexao = await conectar();
        await conexao.query(
            `INSERT INTO modalidades 
             (titulo, descricao, professor, hora_inicio, hora_fim, icone)
             VALUES (?, ?, ?, ?, ?, ?)`, [titulo, descricao, professor, hora_inicio, hora_fim, icone]
        );
        await conexao.end();

        res.json({ sucesso: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ sucesso: false });
    }
});

app.get('/modalidades', async(req, res) => {
    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(
            'SELECT * FROM modalidades ORDER BY titulo'
        );
        await conexao.end();

        res.json(rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json([]);
    }
});



app.listen(3000, () => {
    console.log('🚀 Servidor rodando em http://localhost:3000');
});