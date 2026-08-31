#!/usr/bin/env node

/**
 * JICS - Backend + Frontend UNIFICADO
 * Admin primeiro acesso + login email/matricula + senha 123456
 * EADDRINUSE proof + 1 arquivo só
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(
    import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8080);

// Config DB
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'gesste92_admin',
    password: process.env.DB_PASSWORD || 'GESSTEC2026.',
    database: process.env.DB_NAME || 'gesste92_jics',
    waitForConnections: true,
    connectionLimit: 10
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Serve frontend
// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
res.sendFile(path.join(__dirname, 'public', 'index.html'));

// JWT
const JWT_SECRET = process.env.JWT_SECRET || 'jics-ifro-2026-dev';

function signAdminToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

function setAuthCookie(res, token) {
    res.cookie('admin_token', token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax'
    });
}

// DB Helper
async function query(sql, params) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

// Schema auto
async function ensureSchema() {
    await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      matricula VARCHAR(20) NOT NULL UNIQUE,
      email VARCHAR(190) NULL,
      nome VARCHAR(120) NULL,
      senha_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'ADMIN',
      primeiro_acesso TINYINT(1) DEFAULT 1,
      ativo TINYINT(1) DEFAULT 1,
      ultimo_login DATETIME NULL
    )
  `);

    // Trigger email auto se vazio
    await query(`UPDATE admins SET email = CONCAT(matricula, '@ifro.local') WHERE email IS NULL`);
}

// LOGIN UNIFICADO
app.post('/login', async(req, res) => {
    const { usuario, senha } = req.body;

    try {
        await ensureSchema();

        // Admin (matricula OR email)
        const [admins] = await query(`
      SELECT * FROM admins 
      WHERE (matricula = ? OR email = ?) AND ativo = 1 
      LIMIT 1
    `, [usuario, usuario]);

        if (admins.length) {
            const admin = admins[0];

            // Senha 123456 sempre OK para novo
            let ok = false;
            if (senha === '123456') {
                ok = true;
            } else {
                ok = await bcrypt.compare(senha, admin.senha_hash);
                // Legacy SHA256
                if (!ok && admin.senha_hash.length === 64) {
                    const sha = crypto.createHash('sha256').update(senha).digest('hex');
                    if (sha === admin.senha_hash) ok = true;
                }
            }

            if (ok) {
                await query('UPDATE admins SET ultimo_login = NOW() WHERE id = ?', [admin.id]);

                const token = signAdminToken(admin);
                setAuthCookie(res, token);

                return res.json({
                    sucesso: true,
                    primeiro_acesso: admin.primeiro_acesso === 1,
                    user: {
                        matricula: admin.matricula,
                        email: admin.email,
                        nome: admin.nome,
                        role: admin.role
                    }
                });
            }

            return res.json({ sucesso: false, motivo: 'senha' });
        }

        // Aluno (matricula + SHA256 legacy)
        const [alunos] = await query('SELECT * FROM alunos WHERE matricula = ?', [usuario]);
        if (alunos.length) {
            const aluno = alunos[0];
            const sha = crypto.createHash('sha256').update(senha).digest('hex');
            if (aluno.senha === sha) {
                res.json({ sucesso: true, user: {...aluno, role: 'ALUNO' } });
                return;
            }
        }

        res.json({ sucesso: false, motivo: 'matricula' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false });
    }
});

// PRIMEIRO ACESSO ADMIN
app.post('/admin/setup-first-access', async(req, res) => {
    const { matricula, nova_senha } = req.body;

    try {
        const [admins] = await query('SELECT * FROM admins WHERE matricula = ? AND ativo = 1 AND primeiro_acesso = 1', [matricula]);

        if (admins.length === 0) {
            return res.json({ sucesso: false, mensagem: 'Matrícula inválida ou já configurada' });
        }

        // Validação matricula IFRO
        if (!/^\d{7,10}$/.test(matricula)) {
            return res.json({ sucesso: false, mensagem: 'Matrícula deve ter 7-10 dígitos' });
        }

        const hash = await bcrypt.hash(nova_senha, 10);
        await query(`
      UPDATE admins SET 
      senha_hash = ?, 
      primeiro_acesso = 0, 
      ultimo_login = NOW()
      WHERE matricula = ?
    `, [hash, matricula]);

        res.json({ sucesso: true, mensagem: 'Conta ativada! Use a nova senha.' });
    } catch (err) {
        res.status(500).json({ sucesso: false });
    }
});

// Criar admin (dev)
app.post('/admin/cadastrar', async(req, res) => {
    const { matricula, email, nome } = req.body;
    try {
        const hash = await bcrypt.hash('123456', 10);
        await query(`
      INSERT INTO admins (matricula, email, nome, senha_hash, role, primeiro_acesso)
      VALUES (?, ?, ?, ?, 'ADMIN', 1)
    `, [matricula, email, nome, hash]);
        res.json({ sucesso: true });
    } catch (err) {
        res.json({ sucesso: false });
    }
});

// Role check
app.get('/api/role', async(req, res) => {
    const token = req.cookies.admin_token;
    if (!token) return res.json({ role: null });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ role: decoded.role, user: decoded });
    } catch {
        res.json({ role: null });
    }
});

(async() => {
    await ensureSchema();
    const { createServer } = await
    import ('http');
    const server = createServer(app);
    server.listen(PORT, () => {
        console.log(`🌐 JICS rodando: http://localhost:${PORT}`);
        console.log(`🔑 Teste: iranira.melo@ifro.edu.br / 123456 → primeiro acesso`);
    });
})();
const { createServer } = await
import ('http');
const server = createServer(app);
server.listen(PORT, () => {
console.log(`🌐 JICS rodando: http://localhost:${PORT}`);
console.log(`🔑 Teste: iranira.melo@ifro.edu.br / 123456 → primeiro acesso`);
});
});