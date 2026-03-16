import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { conectar } from './testeConexao.js';
import authRoutes from './src/routes/auth.routes.js';
import adminsRoutes from './src/routes/admins.routes.js';
import logsRoutes from './src/routes/logs.routes.js';
import sorteioRoutes from './src/routes/sorteio.routes.js';
import jogosRoutes from './src/routes/jogos.routes.js';
import rankingRoutes from './src/routes/ranking.routes.js';
import eventosRoutes from './src/routes/eventos.routes.js';
import organizationsRoutes from './src/routes/organizations.routes.js';
import sumulasRoutes from './src/routes/sumulas.routes.js';
import chaveamentoRoutes from './src/routes/chaveamento.routes.js';
import publicRoutes from './src/routes/public.routes.js';
import govRoutes from './src/routes/gov.routes.js';
import recoveryRoutes from './src/routes/recovery.routes.js';
import smsRoutes from './src/routes/sms.routes.js';
import twilioStatusRoutes from './src/routes/twilioStatus.routes.js';
import { attachUserSession, setUserSessionCookie } from './src/middlewares/userSession.js';
import { rateLimitAuth } from './src/middlewares/rateLimitAuth.js';
import { createUserSession } from './src/services/userSession.service.js';
import { signAdminToken, setAuthCookie } from './src/utils/jwt.js';
import { pool } from './src/db/conn.js';

const app = express();
const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT || 3005);
const io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true }
});
app.set('io', io);
app.set('trust proxy', 1);
app.disable('x-powered-by');
httpServer.keepAliveTimeout = 65000;
httpServer.headersTimeout = 66000;
httpServer.requestTimeout = 30000;
httpServer.on('error', (err) => {
    console.error('[http] Erro no servidor:', err);
    if (err && err.code === 'EADDRINUSE') {
        process.exit(1);
    }
});

io.on('connection', (socket) => {
    socket.on('join_evento', ({ eventoId } = {}) => {
        if (eventoId) socket.join(`evento:${eventoId}`);
    });
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(attachUserSession);
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
});
app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true, status: 'up' });
});
app.get('/readyz', async(_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({ ok: true, status: 'ready' });
    } catch (err) {
        res.status(503).json({ ok: false, status: 'db_unavailable' });
    }
});
app.use(express.static(path.join(__dirname, 'public'), {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.html') {
            res.setHeader('Cache-Control', 'no-cache');
            return;
        }
        // Cache moderado para assets estaticos sem travar atualizacao de deploy.
        res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    },
}));
app.use('/auth', authRoutes);
app.use('/auth', recoveryRoutes);
app.use('/', smsRoutes);
app.use('/api', twilioStatusRoutes);
app.use('/admins', adminsRoutes);
app.use('/logs', logsRoutes);
app.use('/eventos', eventosRoutes);
app.use('/organizations', organizationsRoutes);
app.use('/sorteio', sorteioRoutes);
app.use('/jogos', jogosRoutes);
app.use('/ranking', rankingRoutes);
app.use('/sumulas', sumulasRoutes);
app.use('/chaveamento', chaveamentoRoutes);
app.use('/public', publicRoutes);
app.use('/auth/govbr', govRoutes);

app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (_req, res) => {
    res.redirect('/');
});

app.get('/telao', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'telao.html'));
});

async function ensureAlunosRoleColumn() {
    const conexao = await conectar();
    try {
        const [cols] = await conexao.query("SHOW COLUMNS FROM alunos LIKE 'role'");
        if (cols.length === 0) {
            await conexao.query("ALTER TABLE alunos ADD COLUMN role VARCHAR(20) DEFAULT 'ALUNO'");
        }
        await conexao.query("UPDATE alunos SET role = 'ALUNO' WHERE role IS NULL OR role = ''");
    } finally {
        if (conexao) { // <-- Adicionamos esta verificação
            await conexao.end();
        }
    }
}

async function ensureAdminsSchema() {
    const conexao = await conectar();
    try {
        await conexao.query(`
            CREATE TABLE IF NOT EXISTS admins (
              id INT AUTO_INCREMENT PRIMARY KEY,
              organization_id INT NULL,
              matricula VARCHAR(20) NOT NULL,
              nome VARCHAR(120) NULL,
              email VARCHAR(190) NULL,
              senha_hash VARCHAR(255) NOT NULL,
              role VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
              ativo TINYINT(1) NOT NULL DEFAULT 1,
              ultimo_login DATETIME NULL,
              criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              criado_por VARCHAR(20) NULL,
              UNIQUE KEY uq_admins_matricula (matricula)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await conexao.query(`
            CREATE TABLE IF NOT EXISTS organizations (
              id INT AUTO_INCREMENT PRIMARY KEY,
              nome VARCHAR(120) NOT NULL,
              sigla VARCHAR(20) NOT NULL,
              criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE KEY uq_organizations_sigla (sigla)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        let orgId = null;
        const [orgRows] = await conexao.query('SELECT id FROM organizations ORDER BY id LIMIT 1');
        if (orgRows.length === 0) {
            const [orgRes] = await conexao.query(
                'INSERT INTO organizations (nome, sigla) VALUES (?, ?)', ['IFRO', 'IFRO']
            );
            orgId = orgRes.insertId;
        } else {
            orgId = orgRows[0].id;
        }

        const [cols] = await conexao.query('SHOW COLUMNS FROM admins');
        const colSet = new Set(cols.map(c => c.Field));

        if (!colSet.has('id')) {
            await conexao.query('ALTER TABLE admins ADD COLUMN id INT NOT NULL AUTO_INCREMENT UNIQUE');
        }
        if (!colSet.has('organization_id')) {
            await conexao.query('ALTER TABLE admins ADD COLUMN organization_id INT NULL');
        }
        if (!colSet.has('nome')) {
            await conexao.query('ALTER TABLE admins ADD COLUMN nome VARCHAR(120) NULL');
        }
        if (!colSet.has('email')) {
            await conexao.query('ALTER TABLE admins ADD COLUMN email VARCHAR(190) NULL');
        }
        if (!colSet.has('ativo')) {
            await conexao.query('ALTER TABLE admins ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1');
        }

        if (orgId) {
            await conexao.query(
                'UPDATE admins SET organization_id = ? WHERE organization_id IS NULL', [orgId]
            );
        }
        await conexao.query(
            "UPDATE admins SET nome = COALESCE(nome, matricula) WHERE nome IS NULL OR nome = ''"
        );
        await conexao.query(
            "UPDATE admins SET email = COALESCE(email, CONCAT(matricula, '@ifro.local')) WHERE email IS NULL OR email = ''"
        );
        await conexao.query(
            "UPDATE admins SET role = 'STAFF' WHERE role NOT IN ('SUPER_ADMIN','ADMIN','STAFF')"
        );
    } finally {
        await conexao.end();
    }
}

async function ensureModalidadesSchema() {
    const conexao = await conectar();
    try {
        const [tables] = await conexao.query("SHOW TABLES LIKE 'modalidades'");
        if (!tables.length) return;

        const [cols] = await conexao.query('SHOW COLUMNS FROM modalidades');
        const colSet = new Set(cols.map(c => c.Field));

        if (!colSet.has('criado_em')) {
            await conexao.query('ALTER TABLE modalidades ADD COLUMN criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
        }

        if (!colSet.has('atualizado_em')) {
            await conexao.query('ALTER TABLE modalidades ADD COLUMN atualizado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        }

        await conexao.query('UPDATE modalidades SET atualizado_em = COALESCE(atualizado_em, criado_em, CURRENT_TIMESTAMP)');
    } finally {
        await conexao.end();
    }
}

async function ensureSorteioSchema() {
    const conexao = await conectar();
    try {
        const [orgRows] = await conexao.query('SELECT id FROM organizations ORDER BY id ASC LIMIT 1');
        const defaultOrgId = orgRows[0] ? orgRows[0].id : null;

        const [jogosTables] = await conexao.query("SHOW TABLES LIKE 'jogos'");
        if (jogosTables.length) {
            const [jogosColsRows] = await conexao.query('SHOW COLUMNS FROM jogos');
            const jogosCols = new Set(jogosColsRows.map(c => c.Field));

            if (!jogosCols.has('organization_id')) {
                await conexao.query('ALTER TABLE jogos ADD COLUMN organization_id BIGINT NULL');
                jogosCols.add('organization_id');
            }
            if (!jogosCols.has('evento_id')) {
                await conexao.query('ALTER TABLE jogos ADD COLUMN evento_id BIGINT NULL');
                jogosCols.add('evento_id');
            }
            if (!jogosCols.has('atualizado_em')) {
                await conexao.query('ALTER TABLE jogos ADD COLUMN atualizado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
                jogosCols.add('atualizado_em');
            }

            const [jogosIdx] = await conexao.query("SHOW INDEX FROM jogos WHERE Key_name = 'idx_jogos_ctx'");
            if (!jogosIdx.length) {
                const idxCols = ['organization_id', 'evento_id', 'modalidade_id', 'sexo', 'ordem'].filter((col) => jogosCols.has(col));
                if (idxCols.length >= 2) {
                    await conexao.query(`CREATE INDEX idx_jogos_ctx ON jogos (${idxCols.join(', ')})`);
                }
            }

            if (jogosCols.has('organization_id') && jogosCols.has('evento_id') && jogosCols.has('modalidade_id') && jogosCols.has('sexo') && jogosCols.has('ordem')) {
                const [legacyUkOrdem] = await conexao.query("SHOW INDEX FROM jogos WHERE Key_name = 'uk_ordem'");
                if (legacyUkOrdem.length) {
                    await conexao.query('ALTER TABLE jogos DROP INDEX uk_ordem');
                }
                const [ukOrdemCtx] = await conexao.query("SHOW INDEX FROM jogos WHERE Key_name = 'uk_ordem_ctx'");
                if (!ukOrdemCtx.length) {
                    await conexao.query('ALTER TABLE jogos ADD UNIQUE KEY uk_ordem_ctx (organization_id, evento_id, modalidade_id, sexo, ordem)');
                }
            }

            if (jogosCols.has('organization_id') && jogosCols.has('evento_id') && jogosCols.has('modalidade_id') && jogosCols.has('sexo') && jogosCols.has('numero_jogo')) {
                const [legacyUkNumJogo] = await conexao.query("SHOW INDEX FROM jogos WHERE Key_name = 'uk_numjogo'");
                if (legacyUkNumJogo.length) {
                    await conexao.query('ALTER TABLE jogos DROP INDEX uk_numjogo');
                }
                const [ukNumJogoCtx] = await conexao.query("SHOW INDEX FROM jogos WHERE Key_name = 'uk_numjogo_ctx'");
                if (!ukNumJogoCtx.length) {
                    await conexao.query('ALTER TABLE jogos ADD UNIQUE KEY uk_numjogo_ctx (organization_id, evento_id, modalidade_id, sexo, numero_jogo)');
                }
            }

            if (defaultOrgId && jogosCols.has('organization_id')) {
                await conexao.query('UPDATE jogos SET organization_id = ? WHERE organization_id IS NULL', [defaultOrgId]);
            }
        }

        const [metaTables] = await conexao.query("SHOW TABLES LIKE 'sorteio_meta'");
        if (metaTables.length) {
            const [metaColsRows] = await conexao.query('SHOW COLUMNS FROM sorteio_meta');
            const metaCols = new Set(metaColsRows.map(c => c.Field));

            if (!metaCols.has('organization_id')) {
                await conexao.query('ALTER TABLE sorteio_meta ADD COLUMN organization_id BIGINT NULL');
                metaCols.add('organization_id');
            }
            if (!metaCols.has('evento_id')) {
                await conexao.query('ALTER TABLE sorteio_meta ADD COLUMN evento_id BIGINT NULL');
                metaCols.add('evento_id');
            }
            if (!metaCols.has('hora_inicio')) {
                await conexao.query('ALTER TABLE sorteio_meta ADD COLUMN hora_inicio VARCHAR(10) NULL');
                metaCols.add('hora_inicio');
            }
            if (!metaCols.has('intervalo_min')) {
                await conexao.query('ALTER TABLE sorteio_meta ADD COLUMN intervalo_min INT NULL');
                metaCols.add('intervalo_min');
            }
            if (!metaCols.has('chaves_qtd')) {
                await conexao.query('ALTER TABLE sorteio_meta ADD COLUMN chaves_qtd INT NULL');
                metaCols.add('chaves_qtd');
            }
            if (!metaCols.has('atualizado_em')) {
                await conexao.query('ALTER TABLE sorteio_meta ADD COLUMN atualizado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
                metaCols.add('atualizado_em');
            }

            const hasUqCols = ['organization_id', 'evento_id', 'modalidade_id', 'sexo'].every((col) => metaCols.has(col));
            if (hasUqCols) {
                if (defaultOrgId) {
                    await conexao.query('UPDATE sorteio_meta SET organization_id = ? WHERE organization_id IS NULL', [defaultOrgId]);
                }

                await conexao.query(`
                    DELETE sm1
                    FROM sorteio_meta sm1
                    INNER JOIN sorteio_meta sm2
                      ON COALESCE(sm1.organization_id, 0) = COALESCE(sm2.organization_id, 0)
                     AND COALESCE(sm1.evento_id, 0) = COALESCE(sm2.evento_id, 0)
                     AND sm1.modalidade_id = sm2.modalidade_id
                     AND sm1.sexo = sm2.sexo
                     AND sm1.id < sm2.id
                `);

                const [metaUq] = await conexao.query("SHOW INDEX FROM sorteio_meta WHERE Key_name = 'uq_sorteio_meta_ctx'");
                if (!metaUq.length) {
                    await conexao.query('ALTER TABLE sorteio_meta ADD UNIQUE KEY uq_sorteio_meta_ctx (organization_id, evento_id, modalidade_id, sexo)');
                }

                // Remove chave unica legada (modalidade_id, sexo), pois ela
                // impede salvar sorteios por evento e causa ER_DUP_ENTRY no backend novo.
                const [legacyUkMeta] = await conexao.query("SHOW INDEX FROM sorteio_meta WHERE Key_name = 'uk_meta'");
                if (legacyUkMeta.length) {
                    await conexao.query('ALTER TABLE sorteio_meta DROP INDEX uk_meta');
                }
            }
        }
    } finally {
        await conexao.end();
    }
}

function normalizeCursoTexto(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function getCursoCodigo(descricao) {
    const cursosCodigo = {
        'Técnico em Informática Integrado ao Ensino Médio': 606,
        'Técnico em Química Integrado ao Ensino Médio': 608,
        'Técnico em Edificações Integrado ao Ensino Médio': 604,
        'Técnico em Eletrotécnica Integrado ao Ensino Médio': 605
    };
    if (!descricao) return null;
    if (cursosCodigo[descricao]) return cursosCodigo[descricao];

    const normalized = normalizeCursoTexto(descricao);
    if (normalized.includes('informatica')) return 606;
    if (normalized.includes('quimica')) return 608;
    if (normalized.includes('edific')) return 604;
    if (normalized.includes('eletro')) return 605;
    return null;
}

async function logAudit(userId, entidade, entidadeId, acao, payload = null) {
    try {
        const conexao = await conectar();
        await conexao.query(
            'INSERT INTO audit_logs (user_id, entidade, entidade_id, acao, payload) VALUES (?,?,?,?,?)', [userId || null, entidade, entidadeId || null, acao, payload ? JSON.stringify(payload) : null]
        );
        await conexao.end();
    } catch (err) {
        console.warn('Falha ao registrar auditoria', err.message);
    }
}

app.post('/login', rateLimitAuth, async(req, res) => {
    const { usuario, senha } = req.body;

    try {
        const conexao = await conectar();
        // 1) Admin login (tabela admins)
        const [adminRows] = await conexao.query(
            `SELECT id, organization_id, matricula, nome, email, senha_hash, role, ativo, ultimo_login, criado_por
             FROM admins
             WHERE matricula = ?
             LIMIT 1`, [usuario]
        );
        if (adminRows.length > 0) {
            const admin = adminRows[0];
            if (admin.ativo === 0) {
                await conexao.end();
                return res.json({ sucesso: false, motivo: 'inativo' });
            }
            const senhaPlain = String(senha || '');
            let ok = await bcrypt.compare(senhaPlain, admin.senha_hash || '');
            // fallback: admins antigos com SHA2(256) em hex
            if (!ok && typeof admin.senha_hash === 'string' && admin.senha_hash.length === 64) {
                const sha = crypto.createHash('sha256').update(senhaPlain).digest('hex');
                if (sha === admin.senha_hash) {
                    ok = true;
                    const newHash = await bcrypt.hash(senhaPlain, 10);
                    await conexao.query('UPDATE admins SET senha_hash = ? WHERE matricula = ?', [newHash, admin.matricula]);
                }
            }
            if (!ok) {
                await conexao.end();
                return res.json({ sucesso: false, motivo: 'senha' });
            }
            await conexao.query(
                'UPDATE admins SET ultimo_login = NOW() WHERE matricula = ?', [admin.matricula]
            );
            await conexao.end();
            const token = signAdminToken({
                id: admin.id,
                organization_id: admin.organization_id,
                role: admin.role,
                nome: admin.nome,
                email: admin.email
            });
            setAuthCookie(res, token);
            return res.json({
                sucesso: true,
                user: {
                    matricula: admin.matricula,
                    nome: admin.nome,
                    role: admin.role,
                    email: admin.email
                }
            });
        }

        const [found] = await conexao.query(
            `SELECT id, matricula, nome, campus, turma, email_academico, email_pessoal,
                    descricao_curso, data_nascimento, telefone, sexo, role
             FROM alunos
             WHERE matricula = ?`, [usuario]
        );

        if (found.length === 0) {
            await conexao.end();
            return res.json({ sucesso: false, motivo: 'matricula' });
        }

        const [valid] = await conexao.query(
            `SELECT 1 FROM alunos WHERE matricula = ? AND senha = SHA2(?, 256)`, [usuario, senha]
        );

        if (valid.length === 0) {
            await conexao.end();
            return res.json({ sucesso: false, motivo: 'senha' });
        }

        const user = found[0];
        if (!user.role) {
            user.role = user.matricula === 'ADMIN' ? 'ADMIN' : 'ALUNO';
        }

        try {
            const sessionId = createUserSession({ matricula: user.matricula, role: user.role, id: user.id });
            setUserSessionCookie(res, sessionId);
        } catch (_) {
            // evita quebrar login se session falhar
        }

        await conexao.end();
        res.json({ sucesso: true, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false });
    }
});

app.post('/admin/cadastrar-admin', async(req, res) => {
    const { matricula, senha, role, criado_por, criado_por_matricula } = req.body || {};
    if (!matricula || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: 'Dados inválidos' });
    }
    const roleValue = ['SUPER_ADMIN', 'ADMIN'].includes(String(role || '').toUpperCase()) ?
        String(role).toUpperCase() :
        'ADMIN';
    try {
        const conexao = await conectar();
        const [exists] = await conexao.query('SELECT matricula FROM admins WHERE matricula = ?', [matricula]);
        if (exists.length > 0) {
            await conexao.end();
            return res.status(409).json({ sucesso: false, mensagem: 'Matrícula já cadastrada' });
        }
        let createdBy = criado_por || null;
        if (!createdBy && criado_por_matricula) {
            createdBy = criado_por_matricula;
        }
        const hash = await bcrypt.hash(String(senha), 10);
        await conexao.query(
            `INSERT INTO admins (matricula, senha_hash, role, criado_por)
             VALUES (?, ?, ?, ?)`, [matricula, hash, roleValue, createdBy]
        );
        await conexao.end();
        res.json({ sucesso: true });
    } catch (err) {
        console.error('admin create', err);
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

app.post('/admin/buscar-aluno', async(req, res) => {
    const { nome, data_nascimento } = req.body;

    if (!nome || !data_nascimento) {
        return res.json([]);
    }

    try {
        const conexao = await conectar();
        const data = String(data_nascimento).trim();
        const [rows] = await conexao.query(
            `SELECT id, matricula, nome, campus, turma, email_pessoal, descricao_curso, data_nascimento
             FROM alunos
             WHERE nome LIKE ?
               AND (
                 data_nascimento = ?
                 OR DATE(data_nascimento) = ?
                 OR STR_TO_DATE(data_nascimento, '%d/%m/%Y') = ?
               )`, [`%${nome}%`, data, data, data]
        );
        await conexao.end();
        res.json(rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json([]);
    }
});

app.get('/admin/metrics', async(req, res) => {
    try {
        const conexao = await conectar();
        const [
            [{ total: alunos }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM alunos');
        const [
            [{ total: inscricoes }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM inscricoes');
        const [
            [{ total: modalidades }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM modalidades');
        const [
            [{ total: noticias }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM noticias');
        const [
            [{ total: jogos }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM jogos');
        await conexao.end();
        res.json({ alunos, inscricoes, modalidades, noticias, jogos });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ alunos: 0, inscricoes: 0, modalidades: 0, noticias: 0, jogos: 0 });
    }
});

app.get('/admin/aluno/:matricula', async(req, res) => {
    const { matricula } = req.params;
    if (!matricula) return res.status(400).json({ erro: 'Matrícula inválida' });
    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(
            `SELECT id, matricula, nome, campus, turma, email_academico, email_pessoal,
                    descricao_curso, data_nascimento, telefone, sexo, role
             FROM alunos WHERE matricula = ?`, [matricula]
        );
        await conexao.end();
        if (rows.length === 0) return res.status(404).json({ erro: 'Aluno não encontrado' });
        res.json(rows[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro no servidor' });
    }
});

app.put('/admin/aluno/:matricula', async(req, res) => {
    const { matricula } = req.params;
    const {
        nome,
        campus,
        descricao_curso,
        turma,
        data_nascimento,
        email_academico,
        email_pessoal,
        telefone,
        sexo,
        role
    } = req.body;

    const updates = [];
    const params = [];

    if (nome !== undefined) {
        updates.push('nome = ?');
        params.push(nome);
    }
    if (campus !== undefined) {
        updates.push('campus = ?');
        params.push(campus);
    }
    if (descricao_curso !== undefined) {
        updates.push('descricao_curso = ?');
        params.push(descricao_curso);
        const codigo = getCursoCodigo(descricao_curso);
        if (codigo) {
            updates.push('codigo_curso = ?');
            params.push(codigo);
        }
    }
    if (turma !== undefined) {
        updates.push('turma = ?');
        params.push(turma);
    }
    if (data_nascimento !== undefined) {
        updates.push('data_nascimento = ?');
        params.push(data_nascimento);
    }
    if (email_academico !== undefined) {
        updates.push('email_academico = ?');
        params.push(email_academico);
    }
    if (email_pessoal !== undefined) {
        updates.push('email_pessoal = ?');
        params.push(email_pessoal);
    }
    if (telefone !== undefined) {
        updates.push('telefone = ?');
        params.push(telefone);
    }
    if (sexo !== undefined) {
        updates.push('sexo = ?');
        params.push(sexo);
    }
    if (role !== undefined) {
        const roleValue = ['ADMIN', 'PROFESSOR', 'ALUNO'].includes(String(role).toUpperCase()) ?
            String(role).toUpperCase() :
            'ALUNO';
        updates.push('role = ?');
        params.push(roleValue);
    }

    if (updates.length === 0) {
        return res.status(400).json({ sucesso: false, mensagem: 'Nada para atualizar' });
    }

    try {
        const conexao = await conectar();
        params.push(matricula);
        await conexao.query(`UPDATE alunos SET ${updates.join(', ')} WHERE matricula = ?`, params);
        await conexao.end();
        res.json({ sucesso: true });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false });
    }
});

app.post('/alterar-senha', async(req, res) => {
    const { matricula, senhaAtual, novaSenha } = req.body;

    try {
        const conexao = await conectar();

        const [confere] = await conexao.query(
            `SELECT matricula FROM alunos
             WHERE matricula = ?
               AND senha = SHA2(?, 256)`, [matricula, senhaAtual]
        );

        if (confere.length === 0) {
            await conexao.end();
            return res.json({ sucesso: false, tipo: 'senha_atual_incorreta' });
        }

        const [mesma] = await conexao.query(
            `SELECT matricula FROM alunos
             WHERE matricula = ?
               AND senha = SHA2(?, 256)`, [matricula, novaSenha]
        );

        if (mesma.length > 0) {
            await conexao.end();
            return res.json({ sucesso: false, tipo: 'mesma_senha' });
        }

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
        senha,
        role
    } = req.body;

    const codigo_curso = getCursoCodigo(descricao_curso);
    const roleValue = ['ADMIN', 'PROFESSOR'].includes(String(role || '').toUpperCase()) ?
        String(role).toUpperCase() :
        'ALUNO';

    if (!codigo_curso) {
        return res.json({ sucesso: false, mensagem: 'Curso inválido' });
    }

    try {
        const conexao = await conectar();

        const [existe] = await conexao.query(
            'SELECT matricula FROM alunos WHERE matricula = ?', [matricula]
        );

        if (existe.length > 0) {
            await conexao.end();
            return res.json({ sucesso: false, mensagem: 'Matrícula já cadastrada' });
        }

        await conexao.query(`
            INSERT INTO alunos
            (matricula, nome, campus, descricao_curso, codigo_curso, turma, data_nascimento, email_pessoal, senha, role)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, SHA2(?, 256), ?)
        `, [
            matricula,
            nome,
            campus,
            descricao_curso,
            codigo_curso,
            turma,
            data_nascimento,
            email_pessoal,
            senha,
            roleValue
        ]);

        await conexao.end();
        res.json({ sucesso: true });

    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false });
    }
});

app.get('/admin/verificar-matricula/:matricula', async(req, res) => {
    const { matricula } = req.params;

    if (!matricula) {
        return res.json({ existe: false });
    }

    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(
            'SELECT matricula FROM alunos WHERE matricula = ?', [matricula]
        );
        await conexao.end();

        res.json({ existe: rows.length > 0 });
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
        await conexao.query('DELETE FROM noticias WHERE id = ?', [id]);
        await conexao.end();

        res.status(200).json({ sucesso: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false });
    }
});

app.post('/admin/modalidades', async(req, res) => {
    const { titulo, descricao, professor, hora_inicio, hora_fim, nome, horario } = req.body || {};

    const tituloFinal = String(titulo || nome || '').trim();
    const descricaoFinal = String(descricao || horario || 'Sem descricao').trim();
    const professorFinal = String(professor || 'Nao informado').trim();
    const horaInicioFinal = String(hora_inicio || '00:00').trim();
    const horaFimFinal = String(hora_fim || '00:00').trim();

    if (!tituloFinal) {
        return res.status(400).json({ sucesso: false, mensagem: 'Titulo obrigatorio.' });
    }

    try {
        const conexao = await conectar();
        const [insertResult] = await conexao.query(
            `INSERT INTO modalidades
               (titulo, descricao, professor, hora_inicio, hora_fim)
               VALUES (?, ?, ?, ?, ?)`, [tituloFinal, descricaoFinal, professorFinal, horaInicioFinal, horaFimFinal]
        );

        const [rows] = await conexao.query(
            `SELECT id,
                        titulo AS nome,
                        titulo,
                        descricao,
                        professor,
                        hora_inicio,
                        hora_fim,
                        CONCAT(
                            COALESCE(hora_inicio, ''),
                            CASE WHEN hora_inicio IS NOT NULL AND hora_inicio <> '' AND hora_fim IS NOT NULL AND hora_fim <> '' THEN ' - ' ELSE '' END,
                            COALESCE(hora_fim, '')
                        ) AS horario,
                        criado_em,
                        atualizado_em
                 FROM modalidades
                 WHERE id = ?
                 LIMIT 1`, [insertResult.insertId]
        );
        await conexao.end();

        res.json({ sucesso: true, data: rows[0] || null });
    } catch (e) {
        console.error(e);
        res.status(500).json({ sucesso: false });
    }
});

app.put('/admin/modalidades/:id', async(req, res) => {
    const { id } = req.params;
    const { titulo, descricao, professor, hora_inicio, hora_fim, nome, horario } = req.body || {};

    const tituloFinal = String(titulo || nome || '').trim();
    const descricaoFinal = String(descricao || horario || 'Sem descricao').trim();
    const professorFinal = String(professor || 'Nao informado').trim();
    const horaInicioFinal = String(hora_inicio || '00:00').trim();
    const horaFimFinal = String(hora_fim || '00:00').trim();

    if (!tituloFinal) {
        return res.status(400).json({ sucesso: false, mensagem: 'Titulo obrigatorio.' });
    }

    try {
        const conexao = await conectar();
        await conexao.query(
            `UPDATE modalidades
               SET titulo = ?, descricao = ?, professor = ?, hora_inicio = ?, hora_fim = ?
               WHERE id = ?`, [tituloFinal, descricaoFinal, professorFinal, horaInicioFinal, horaFimFinal, id]
        );

        const [cols] = await conexao.query('SHOW COLUMNS FROM modalidades');
        const colSet = new Set(cols.map(c => c.Field));
        if (colSet.has('atualizado_em')) {
            await conexao.query('UPDATE modalidades SET atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        } else if (colSet.has('updated_at')) {
            await conexao.query('UPDATE modalidades SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        }

        await conexao.end();
        res.json({ sucesso: true });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false });
    }
});

app.delete('/admin/modalidades/:id', async(req, res) => {
    const { id } = req.params;
    try {
        const conexao = await conectar();
        await conexao.query('DELETE FROM modalidades WHERE id = ?', [id]);
        await conexao.end();
        res.json({ sucesso: true });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false });
    }
});

app.get('/modalidades', async(req, res) => {
    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(`
            SELECT id,
                   titulo AS nome,
                   titulo,
                   descricao,
                   professor,
                   hora_inicio,
                   hora_fim,
                   CONCAT(
                     COALESCE(hora_inicio, ''),
                     CASE WHEN hora_inicio IS NOT NULL AND hora_inicio <> '' AND hora_fim IS NOT NULL AND hora_fim <> '' THEN ' - ' ELSE '' END,
                     COALESCE(hora_fim, '')
                   ) AS horario,
                   criado_em,
                   atualizado_em
            FROM modalidades
            ORDER BY titulo
        `);
        await conexao.end();

        res.json(rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json([]);
    }
});

app.post('/inscricoes/jics', async(req, res) => {
    const { aluno_id, modalidade_id } = req.body;

    if (!aluno_id || !modalidade_id) {
        return res.status(400).json({ sucesso: false, mensagem: 'Dados inválidos' });
    }

    try {
        const conexao = await conectar();
        const [existe] = await conexao.query(`
            SELECT id FROM inscricoes
            WHERE aluno_id = ? AND modalidade_id = ?
        `, [aluno_id, modalidade_id]);

        if (existe.length > 0) {
            await conexao.end();
            return res.json({ sucesso: false, mensagem: 'Aluno já inscrito nessa modalidade' });
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

app.post('/inscricoes/jics/cancelar', async(req, res) => {
    const { inscricao_id, aluno_id, matricula, modalidade_id, modalidade_nome } = req.body || {};

    if (!inscricao_id && (!modalidade_id && !modalidade_nome) && (!aluno_id && !matricula)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Dados inválidos' });
    }

    try {
        const conexao = await conectar();
        let alvoId = aluno_id;
        if (!alvoId && matricula) {
            const [rows] = await conexao.query('SELECT id FROM alunos WHERE matricula = ? LIMIT 1', [matricula]);
            if (!rows.length) {
                await conexao.end();
                return res.json({ sucesso: false, mensagem: 'Aluno não encontrado' });
            }
            alvoId = rows[0].id;
        }

        let modId = modalidade_id;
        if (!modId && modalidade_nome) {
            const [mods] = await conexao.query('SELECT id FROM modalidades WHERE titulo = ? LIMIT 1', [modalidade_nome]);
            if (mods.length) modId = mods[0].id;
        }

        let result;
        if (inscricao_id) {
            [result] = await conexao.query('DELETE FROM inscricoes WHERE id = ?', [inscricao_id]);
        } else {
            if (!alvoId || !modId) {
                await conexao.end();
                return res.json({ sucesso: false, mensagem: 'Inscrição não encontrada' });
            }
            [result] = await conexao.query(
                'DELETE FROM inscricoes WHERE aluno_id = ? AND modalidade_id = ?', [alvoId, modId]
            );
        }

        await conexao.end();
        if (!result || result.affectedRows === 0) {
            return res.json({ sucesso: false, mensagem: 'Inscrição não encontrada' });
        }
        res.json({ sucesso: true });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false });
    }
});

app.get('/inscricoes/jics', async(req, res) => {
    const { aluno_id, matricula } = req.query;
    let where = '';
    const params = [];

    if (aluno_id) {
        where = 'WHERE a.id = ?';
        params.push(aluno_id);
    } else if (matricula) {
        where = 'WHERE a.matricula = ?';
        params.push(matricula);
    }

    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(`
            SELECT
                i.id AS inscricao_id,
                a.nome,
                a.matricula,
                a.turma,
                a.sexo,
                i.tipo,
                i.modalidade_id,
                m.titulo AS modalidade,
                DATE_FORMAT(i.data_inscricao, '%d/%m/%Y %H:%i') AS data
            FROM inscricoes i
            JOIN alunos a ON a.id = i.aluno_id
            JOIN modalidades m ON m.id = i.modalidade_id
            ${where}
            ORDER BY i.data_inscricao DESC
        `, params);

        await conexao.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

// --- Sorteio -> Jogos ---
app.post('/admin/sorteio/jogos', async(req, res) => {
    const { modalidade, sexo, chave, jogos } = req.body || {};
    if (!modalidade || !sexo || !Array.isArray(jogos) || !jogos.length) {
        return res.status(400).json({ sucesso: false, mensagem: 'Dados inválidos' });
    }
    try {
        const conexao = await conectar();
        const [mods] = await conexao.query('SELECT id FROM modalidades WHERE titulo = ? LIMIT 1', [modalidade]);
        if (!mods.length) {
            await conexao.end();
            return res.status(400).json({ sucesso: false, mensagem: 'Modalidade não encontrada' });
        }
        const modalidadeId = mods[0].id;
        await conexao.beginTransaction();
        await conexao.query('DELETE FROM jogos WHERE modalidade_id = ? AND sexo = ?', [modalidadeId, sexo]);
        for (const j of jogos) {
            await conexao.query(
                `INSERT INTO jogos (modalidade_id, sexo, chave, jogo_label, ordem, hora_oficial, equipe_a, equipe_b, status)
                 VALUES (?,?,?,?,?,?,?,?, 'agendado')`, [modalidadeId, sexo, j.chave || chave || null, j.jogo, j.ordem, j.hora || null, j.equipeA, j.equipeB]
            );
        }
        const [rows] = await conexao.query(
            `SELECT id, modalidade_id, sexo, chave, jogo_label AS jogo, ordem, hora_oficial AS hora,
                    equipe_a AS equipeA, equipe_b AS equipeB, status
             FROM jogos
             WHERE modalidade_id = ? AND sexo = ?
             ORDER BY ordem`, [modalidadeId, sexo]
        );
        await conexao.commit();
        await conexao.end();
        logAudit(null, 'jogos', modalidadeId, 'sorteio', { jogos: rows.length });
        res.json({ sucesso: true, jogos: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar jogos' });
    }
});

app.get('/admin/jogos', async(req, res) => {
    const { modalidade, sexo, status, chave } = req.query;
    try {
        const conexao = await conectar();
        let sql = `SELECT j.*, m.titulo AS modalidade_nome
                   FROM jogos j
                   JOIN modalidades m ON m.id = j.modalidade_id
                   WHERE 1=1`;
        const params = [];
        if (modalidade) {
            sql += ' AND m.titulo = ?';
            params.push(modalidade);
        }
        if (sexo) {
            sql += ' AND j.sexo = ?';
            params.push(sexo);
        }
        if (status) {
            sql += ' AND j.status = ?';
            params.push(status);
        }
        if (chave) {
            sql += ' AND j.chave = ?';
            params.push(chave);
        }
        sql += ' ORDER BY j.ordem';
        const [rows] = await conexao.query(sql, params);
        await conexao.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

app.put('/admin/jogos/:id/status', async(req, res) => {
    const { status } = req.body || {};
    const { id } = req.params;
    if (!['agendado', 'em_andamento', 'finalizado'].includes(status)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Status inválido' });
    }
    try {
        const conexao = await conectar();
        await conexao.query('UPDATE jogos SET status = ? WHERE id = ?', [status, id]);
        await conexao.end();
        logAudit(null, 'jogo', id, 'status', { status });
        res.json({ sucesso: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false });
    }
});

// --- Súmulas ---
app.post('/admin/sumulas', async(req, res) => {
    const {
        jogo_id,
        modalidade,
        sexo,
        fase,
        etapa,
        data,
        arbitro,
        mesarios,
        inicio,
        fim,
        equipeA,
        equipeB,
        placarA,
        placarB,
        cartoes
    } = req.body || {};
    if (!modalidade || !equipeA || !equipeB) {
        return res.status(400).json({ sucesso: false, mensagem: 'Dados insuficientes' });
    }
    try {
        const conexao = await conectar();
        const [mods] = await conexao.query('SELECT id FROM modalidades WHERE titulo = ? LIMIT 1', [modalidade]);
        const modalidadeId = mods[0] ? mods[0].id : null;
        const [result] = await conexao.query(
            `INSERT INTO sumulas (jogo_id, modalidade_id, sexo, fase, etapa, data, arbitro, mesarios, inicio, fim,
                                  equipe_a, equipe_b, placar_a, placar_b, cartoes)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [jogo_id || null, modalidadeId, sexo || null, fase || null, etapa || null, data || null, arbitro || null,
                mesarios || null, inicio || null, fim || null, equipeA, equipeB, placarA || 0, placarB || 0, cartoes || null
            ]
        );
        if (jogo_id) {
            await conexao.query(
                'UPDATE jogos SET placar_a = ?, placar_b = ?, status = ? WHERE id = ?', [placarA || 0, placarB || 0, 'finalizado', jogo_id]
            );
        }
        await conexao.end();
        logAudit(null, 'sumula', result.insertId, 'create', { jogo_id, placarA, placarB });
        res.json({ sucesso: true, id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar súmula' });
    }
});

app.put('/admin/sumulas/:id', async(req, res) => {
    const { id } = req.params;
    const {
        placarA,
        placarB,
        arbitro,
        mesarios,
        inicio,
        fim,
        cartoes
    } = req.body || {};
    try {
        const conexao = await conectar();
        await conexao.query(
            `UPDATE sumulas SET placar_a = ?, placar_b = ?, arbitro = ?, mesarios = ?, inicio = ?, fim = ?, cartoes = ?
             WHERE id = ?`, [placarA || 0, placarB || 0, arbitro || null, mesarios || null, inicio || null, fim || null, cartoes || null, id]
        );
        await conexao.end();
        logAudit(null, 'sumula', id, 'update', { placarA, placarB });
        res.json({ sucesso: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucesso: false });
    }
});

// ===================== API para o painel admin (consumida pelo JS) =====================
app.get('/api/admin/metrics', async(req, res) => {
    try {
        const conexao = await conectar();
        const [
            [{ total: usuarios }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM alunos');
        const [
            [{ total: inscricoes }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM inscricoes');
        const [
            [{ total: modalidades }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM modalidades');
        const [
            [{ total: comunicados }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM noticias');
        await conexao.end();
        res.json({ usuarios, inscricoes, modalidades, comunicados });
    } catch (erro) {
        console.error('metrics', erro);
        res.status(500).json({ usuarios: 0, inscricoes: 0, modalidades: 0, comunicados: 0 });
    }
});

app.get('/api/inscricoes', async(req, res) => {
    const { modalidade, sexo, turma, campus } = req.query;
    try {
        const conexao = await conectar();
        let sql = `
            SELECT
                a.nome AS aluno,
                a.matricula,
                a.turma,
                a.descricao_curso AS curso,
                a.sexo,
                a.campus,
                m.titulo AS modalidade,
                DATE_FORMAT(i.data_inscricao, '%d/%m/%Y %H:%i') AS data
            FROM inscricoes i
            JOIN alunos a ON a.id = i.aluno_id
            JOIN modalidades m ON m.id = i.modalidade_id
            WHERE 1=1`;
        const params = [];
        if (modalidade) {
            sql += ' AND m.titulo = ?';
            params.push(modalidade);
        }
        if (sexo) {
            sql += ' AND a.sexo = ?';
            params.push(sexo);
        }
        if (turma) {
            sql += ' AND a.turma = ?';
            params.push(turma);
        }
        if (campus) {
            sql += ' AND a.campus = ?';
            params.push(campus);
        }
        sql += ' ORDER BY i.data_inscricao DESC';
        const [rows] = await conexao.query(sql, params);
        await conexao.end();
        res.json(rows);
    } catch (erro) {
        console.error('inscricoes', erro);
        res.status(500).json([]);
    }
});

app.get('/api/usuarios', async(req, res) => {
    const { busca } = req.query;
    try {
        const conexao = await conectar();
        let sql = `
            SELECT id, nome, matricula, turma, role
            FROM alunos
            WHERE 1=1`;
        const params = [];
        if (busca) {
            sql += ` AND (nome LIKE ? OR matricula LIKE ? OR turma LIKE ?)`;
            params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
        }
        sql += ' ORDER BY nome';
        const [rows] = await conexao.query(sql, params);
        await conexao.end();
        res.json(rows);
    } catch (erro) {
        console.error('usuarios', erro);
        res.status(500).json([]);
    }
});

app.get('/api/noticias', async(req, res) => {
    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(`
            SELECT id,
                   titulo,
                   DATE_FORMAT(data_publicacao, '%d/%m/%Y') AS data
            FROM noticias
            ORDER BY data_publicacao DESC
        `);
        await conexao.end();
        res.json(rows.map(r => ({
            id: r.id,
            titulo: r.titulo,
            autor: 'IFRO Esportes',
            data: r.data
        })));
    } catch (erro) {
        console.error('noticias', erro);
        res.status(500).json([]);
    }
});

app.get('/api/modalidades', async(req, res) => {
    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(`
            SELECT id,
                   titulo AS nome,
                   CONCAT(
                     COALESCE(hora_inicio, ''), 
                     CASE WHEN hora_inicio IS NOT NULL AND hora_fim IS NOT NULL THEN ' - ' ELSE '' END,
                     COALESCE(hora_fim, '')
                   ) AS horario
            FROM modalidades
            ORDER BY titulo
        `);
        await conexao.end();
        res.json(rows);
    } catch (erro) {
        console.error('modalidades', erro);
        res.status(500).json([]);
    }
});

// ===================== Dashboards SaaS =====================
app.get('/dashboard/admin/stats', async(_req, res) => {
    try {
        const conexao = await conectar();
        const [
            [{ total: alunos }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM alunos');
        const [
            [{ total: inscricoes }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM inscricoes');
        const [
            [{ total: modalidades }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM modalidades');
        const [
            [{ total: comunicados }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM noticias');
        await conexao.end();
        res.json({ alunos, inscricoes, modalidades, pendencias: 0, comunicados });
    } catch (err) {
        console.error('dashboard admin stats', err);
        res.status(500).json({ alunos: 0, inscricoes: 0, modalidades: 0, pendencias: 0, comunicados: 0 });
    }
});

app.get('/dashboard/admin/ultimas-inscricoes', async(_req, res) => {
    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(`
            SELECT a.nome, m.titulo AS modalidade, DATE_FORMAT(i.data_inscricao, '%d/%m/%Y %H:%i') AS data
            FROM inscricoes i
            JOIN alunos a ON a.id = i.aluno_id
            JOIN modalidades m ON m.id = i.modalidade_id
            ORDER BY i.data_inscricao DESC
            LIMIT 8
        `);
        await conexao.end();
        res.json(rows.map(r => ({
            title: `${r.nome} • ${r.modalidade}`,
            subtitle: 'Nova inscricao',
            meta: r.data
        })));
    } catch (err) {
        console.error('dashboard admin ultimas', err);
        res.status(500).json([]);
    }
});

app.get('/dashboard/admin/chart', async(_req, res) => {
    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(`
            SELECT m.titulo AS modalidade, COUNT(*) AS total
            FROM inscricoes i
            JOIN modalidades m ON m.id = i.modalidade_id
            GROUP BY m.titulo
            ORDER BY total DESC
            LIMIT 8
        `);
        await conexao.end();
        res.json({
            labels: rows.map(r => r.modalidade),
            values: rows.map(r => r.total)
        });
    } catch (err) {
        console.error('dashboard admin chart', err);
        res.status(500).json({ labels: [], values: [] });
    }
});

app.get('/dashboard/admin/activity', async(_req, res) => {
    try {
        const conexao = await conectar();
        const [insc] = await conexao.query(`
            SELECT a.nome, m.titulo AS modalidade, i.data_inscricao AS criado_em
            FROM inscricoes i
            JOIN alunos a ON a.id = i.aluno_id
            JOIN modalidades m ON m.id = i.modalidade_id
            ORDER BY i.data_inscricao DESC
            LIMIT 5
        `);
        const [news] = await conexao.query(`
            SELECT titulo, data_publicacao AS criado_em
            FROM noticias
            ORDER BY data_publicacao DESC
            LIMIT 3
        `);
        await conexao.end();
        const activity = [
            ...insc.map(i => ({
                type: 'nova inscricao',
                message: `${i.nome} entrou em ${i.modalidade}`,
                createdAt: new Date(i.criado_em).toLocaleString('pt-BR')
            })),
            ...news.map(n => ({
                type: 'comunicado',
                message: `Noticia publicada: ${n.titulo}`,
                createdAt: new Date(n.criado_em).toLocaleString('pt-BR')
            }))
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(activity.slice(0, 8));
    } catch (err) {
        console.error('dashboard admin activity', err);
        res.status(500).json([]);
    }
});

app.get('/dashboard/aluno/summary', async(req, res) => {
    const { matricula } = req.query;
    if (!matricula) return res.status(400).json({ status: 'Pendente', inscricoesCount: 0, avisosCount: 0, nextGames: [] });
    try {
        const conexao = await conectar();
        const [
            [{ total: inscricoesCount }]
        ] = await conexao.query(`
            SELECT COUNT(*) AS total
            FROM inscricoes i
            JOIN alunos a ON a.id = i.aluno_id
            WHERE a.matricula = ?
        `, [matricula]);
        const [
            [{ total: avisosCount }]
        ] = await conexao.query('SELECT COUNT(*) AS total FROM noticias');
        await conexao.end();
        res.json({
            status: inscricoesCount > 0 ? 'Inscrito' : 'Pendente',
            inscricoesCount,
            avisosCount,
            nextGames: []
        });
    } catch (err) {
        console.error('dashboard aluno summary', err);
        res.status(500).json({ status: 'Pendente', inscricoesCount: 0, avisosCount: 0, nextGames: [] });
    }
});

app.get('/dashboard/aluno/inscricoes', async(req, res) => {
    const { matricula } = req.query;
    if (!matricula) return res.json([]);
    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(`
            SELECT m.titulo AS modalidade, DATE_FORMAT(i.data_inscricao, '%d/%m/%Y %H:%i') AS data
            FROM inscricoes i
            JOIN alunos a ON a.id = i.aluno_id
            JOIN modalidades m ON m.id = i.modalidade_id
            WHERE a.matricula = ?
            ORDER BY i.data_inscricao DESC
        `, [matricula]);
        await conexao.end();
        res.json(rows.map(r => ({
            modalidade: r.modalidade,
            status: 'Ativa',
            updatedAt: r.data
        })));
    } catch (err) {
        console.error('dashboard aluno inscricoes', err);
        res.status(500).json([]);
    }
});

app.get('/dashboard/aluno/avisos', async(_req, res) => {
    try {
        const conexao = await conectar();
        const [rows] = await conexao.query(`
            SELECT titulo, descricao
            FROM noticias
            ORDER BY data_publicacao DESC
            LIMIT 6
        `);
        await conexao.end();
        res.json(rows.map(r => ({
            title: r.titulo,
            subtitle: r.descricao
        })));
    } catch (err) {
        console.error('dashboard aluno avisos', err);
        res.status(500).json([]);
    }
});

ensureAlunosRoleColumn()
    .then(ensureAdminsSchema)
    .then(ensureModalidadesSchema)
    .then(ensureSorteioSchema)
    .then(() => {
        httpServer.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}: http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Erro ao preparar o banco:', err);
        process.exit(1);
    });

let shuttingDown = false;
async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] Sinal recebido: ${signal}. Encerrando servidor...`);

    const forceExit = setTimeout(() => {
        console.error('[shutdown] Timeout ao encerrar. Finalizando processo.');
        process.exit(1);
    }, 12000);
    forceExit.unref();

    let closeErr = null;
    if (httpServer.listening) {
        await new Promise((resolve) => {
            httpServer.close((err) => {
                closeErr = err || null;
                if (closeErr) {
                    console.error('[shutdown] Erro ao fechar servidor HTTP:', closeErr);
                }
                resolve();
            });
        });
    }

    try {
        await pool.end();
    } catch (dbErr) {
        console.error('[shutdown] Erro ao fechar pool do banco:', dbErr);
    }

    process.exit(closeErr ? 1 : 0);
}

process.on('SIGINT', () => { gracefulShutdown('SIGINT'); });
process.on('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
process.on('unhandledRejection', (err) => {
    console.error('[process] UnhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
    console.error('[process] UncaughtException:', err);
    gracefulShutdown('uncaughtException');
});