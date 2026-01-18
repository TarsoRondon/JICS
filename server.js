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
            'SELECT id, matricula, nome, campus, turma, email_academico, email_pessoal, descricao_curso, data_nascimento, telefone FROM alunos WHERE matricula = ? AND senha = SHA2(?, 256)', [usuario, senha]
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

        await conexao.end();
        res.json({ sucesso: true });

    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false });
    }
});

app.get('/admin/verificar-matricula/:matricula', async (req, res) => {
    const { matricula } = req.params;

    if (!matricula) {
        return res.json({ existe: false });
    }

    try {
        const conexao = await conectar();

        const [rows] = await conexao.query(
            'SELECT matricula FROM alunos WHERE matricula = ?',
            [matricula]
        );

        await conexao.end();

        res.json({
            existe: rows.length > 0
        });

    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: true });
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
    const { titulo, descricao, professor, hora_inicio, hora_fim} = req.body;

    if (!titulo || !descricao || !professor || !hora_inicio || !hora_fim) {
        return res.json({ sucesso: false });
    }

    try {
        const conexao = await conectar();
        await conexao.query(
            `INSERT INTO modalidades 
             (titulo, descricao, professor, hora_inicio, hora_fim)
             VALUES (?, ?, ?, ?, ?)`, [titulo, descricao, professor, hora_inicio, hora_fim]
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

/* editar noticia*/
app.put('/noticias/:id', async(req, res) => {
    const { titulo, descricao } = req.body;
    const { id } = req.params;

    try {
        const conexao = await conectar();

        await conexao.query(
            `UPDATE noticias 
             SET titulo = ?, 
                 descricao = ?, 
                 data_edicao = NOW()
             WHERE id = ?`, [titulo, descricao, id]
        );

        const [rows] = await conexao.query(
            'SELECT * FROM noticias WHERE id = ?', [id]
        );

        await conexao.end();
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json(err);
    }
});

app.delete('/noticias/:id', async(req, res) => {
    const { id } = req.params;

    try {
        const conexao = await conectar();

        await conexao.query(
            'DELETE FROM noticias WHERE id = ?', [id]
        );

        await conexao.end();

        res.status(200).json({ sucesso: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false });
    }
});

app.post('/inscricoes/jics', async (req, res) => {
    const { aluno_id, modalidade_id } = req.body;

    if (!aluno_id || !modalidade_id) {
        return res.status(400).json({
            sucesso: false,
            mensagem: 'Dados inválidos'
        });
    }

    try {
        const conexao = await conectar();

        // evita inscrição duplicada
        const [existe] = await conexao.query(`
            SELECT id FROM inscricoes
            WHERE aluno_id = ? AND modalidade_id = ?
        `, [aluno_id, modalidade_id]);

        if (existe.length > 0) {
            await conexao.end();
            return res.json({
                sucesso: false,
                mensagem: 'Aluno já inscrito nessa modalidade'
            });
        }

        await conexao.query(`
            INSERT INTO inscricoes (aluno_id, modalidade_id, tipo)
            VALUES (?, ?, 'JICS')
        `, [aluno_id, modalidade_id]);

        await conexao.end();

        res.json({ sucesso: true });

    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false });
    }
});

// GET /inscricoes/jics
app.get('/inscricoes/jics', async (req, res) => {
    try {
        const conexao = await conectar();

        const [rows] = await conexao.query(`
            SELECT 
                a.nome,
                a.matricula,
                a.turma,
                a.sexo,
                i.tipo,
                m.titulo AS modalidade,
                DATE_FORMAT(i.data_inscricao, '%d/%m/%Y %H:%i') AS data
            FROM inscricoes i
            JOIN alunos a ON a.id = i.aluno_id
            JOIN modalidades m ON m.id = i.modalidade_id
            ORDER BY i.data_inscricao DESC
        `);

        await conexao.end();
        res.json(rows);

    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});


///////////////
app.listen(3000, () => {
    console.log('🚀 Servidor rodando em http://localhost:3000');
});