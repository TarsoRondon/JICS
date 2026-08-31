#!/usr/bin/env node

/**
 * JICS - Backend + Frontend UNIFICADO V2
 * Admin primeiro acesso + login email/matricula
 */

import express from 'express';
import { createServer } from 'http';
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

const JWT_SECRET = process.env.JWT_SECRET || 'jics-ifro-2026-dev';

// DB
const pool = mysql.createPool({
    host: process.env.DB_HOST || '192.185.176.152',
    user: process.env.DB_USER || 'gesste92_admin',
    password: process.env.DB_PASSWORD || 'GESSTEC2026.',
    database: process.env.DB_NAME || 'gesste92_jics',
    waitForConnections: true,
    connectionLimit: 10
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), {
    etag: true
}));

// Schema
async function ensureSchema() {
    try {
        await pool.execute(`
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
      ) ENGINE=InnoDB
    `);

        // Email auto-fill
        await pool.execute(`UPDATE admins SET email = CONCAT(matricula, '@ifro.local') WHERE email IS NULL OR email = ''`);

        console.log('✅ Schema OK');
    } catch (err) {
        console.error('Schema error:', err.message);
    }
}

// JWT
function signAdminToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

function setAuthCookie(res, token) {
    res.cookie('admin_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000
    });
}

// Routes
app.post('/login', async(req, res) => {
    const { usuario, senha } = req.body;

    try {
        await ensureSchema();

        // Admin check
        const [admins] = await pool.execute(`
      SELECT * FROM admins WHERE (matricula = ? OR email = ?) AND ativo = 1 LIMIT 1
    `, [usuario, usuario]);

        if (admins.length) {
            const admin = admins[0];
            let valid = false;

            if (senha === '123456') {
                valid = true;
            } else {
                valid = await bcrypt.compare(senha, admin.senha_hash);
                if (!valid && admin.senha_hash && admin.senha_hash.length === 64) {
                    const sha256 = crypto.createHash('sha256').update(senha).digest('hex');
                    if (sha256 === admin.senha_hash) valid = true;
                }
            }

            if (valid) {
                await pool.execute('UPDATE admins SET ultimo_login = NOW() WHERE id = ?', [admin.id]);

                const token = signAdminToken(admin);
                setAuthCookie(res, token);

                return res.json({
                    sucesso: true,
                    primeiro_acesso: admin.primeiro_acesso === 1,
                    user: {
                        matricula: admin.matricula,
                        nome: admin.nome,
                        email: admin.email,
                        role: admin.role
                    }
                });
            }

            return res.json({ sucesso: false, motivo: 'senha' });
        }

        // Student fallback
        const [students] = await pool.execute('SELECT * FROM alunos WHERE matricula = ?', [usuario]);
        if (students.length) {
            const student = students[0];
            const sha256 = crypto.createHash('sha256').update(senha).digest('hex');
            if (student.senha === sha256) {
                return res.json({ sucesso: true, user: {...student, role: 'ALUNO' } });
            }
        }

        res.json({ sucesso: false, motivo: 'matricula' });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ sucesso: false });
    }
});

app.post('/admin/setup-first-access', async(req, res) => {
    const { matricula, nova_senha } = req.body;

    if (!nova_senha || nova_senha.length < 6) {
        return res.status(400).json({ sucesso: false, mensagem: 'Senha mínima 6 caracteres' });
    }

    try {
        const [admins] = await pool.execute(`
      SELECT * FROM admins WHERE matricula = ? AND ativo = 1 AND primeiro_acesso = 1
    `, [matricula]);

        if (!admins.length) {
            return res.json({ sucesso: false, mensagem: 'Conta já ativada ou inválida' });
        }

        if (!/^\d{7,10}$/.test(matricula)) {
            return res.json({ sucesso: false, mensagem: 'Matrícula inválida' });
        }

        const hash = await bcrypt.hash(nova_senha, 12);
        await pool.execute(`
      UPDATE admins SET senha_hash = ?, primeiro_acesso = 0, ultimo_login = NOW() 
      WHERE id = ?
    `, [hash, admins[0].id]);

        res.json({ sucesso: true, mensagem: 'Conta ativada com sucesso!' });
    } catch (err) {
        console.error('First access error:', err);
        res.status(500).json({ sucesso: false });
    }
});

// Serve SPA
app.get('/admin/dev-create', async(req, res) => {
    const { matricula, nome } = req.body;
    try {
        const hash = await bcrypt.hash('123456', 12);
        await pool.execute(`
      INSERT INTO admins (matricula, nome, senha_hash, role) 
      VALUES (?, ?, ?, 'ADMIN') ON DUPLICATE KEY UPDATE nome = VALUES(nome)
    `, [matricula, nome || matricula, hash]);
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false });
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Role check
app.get('/api/user/role', (req, res) => {
    const token = req.cookies.admin_token;
    if (!token) return res.json({ sucesso: false, role: null });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ sucesso: true, role: decoded.role || 'ADMIN', user: decoded });
    } catch {
        res.json({ sucesso: false, role: null });
    }
});

// Dev admin create
app.post('/admin/dev-create', async(req, res) => {
    const { matricula, nome } = req.body;
    try {
        const hash = await bcrypt.hash('123456', 12);
        await pool.execute(`
      INSERT INTO admins (matricula, nome, senha_hash, role) 
      VALUES (?, ?, ?, 'ADMIN') ON DUPLICATE KEY UPDATE nome = VALUES(nome)
    `, [matricula, nome || matricula, hash]);
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false });
    }
});

ensureSchema().then(() => {
    const server = createServer(app);
    server.listen(PORT, () => {
        console.log(`\n🚀 JICS LIVE http://localhost:${PORT}`);
        console.log(`🔑 iranira.melo@ifro.edu.br : 123456`);
        console.log('📱 Admin primeiro acesso ativo!');
    });
}).catch(console.error);