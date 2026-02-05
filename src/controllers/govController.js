import crypto from 'crypto';
import { conectar } from '../../testeConexao.js';

const stateStore = new Map();
const sessionStore = new Map();
const STATE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 10 * 60 * 1000;

function cleanStore(store) {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.expiresAt <= now) store.delete(key);
  }
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function extractCpf(profile) {
  const candidates = [
    profile?.cpf,
    profile?.CPF,
    profile?.document,
    profile?.preferred_username,
    profile?.sub
  ];
  for (const candidate of candidates) {
    const cpf = normalizeCpf(candidate);
    if (cpf.length === 11) return cpf;
  }
  return '';
}

function getMissingEnv() {
  const required = [
    'GOVBR_AUTH_URL',
    'GOVBR_TOKEN_URL',
    'GOVBR_USERINFO_URL',
    'GOVBR_CLIENT_ID',
    'GOVBR_CLIENT_SECRET',
    'GOVBR_REDIRECT_URI'
  ];
  return required.filter(key => !process.env[key]);
}

function buildAuthUrl(state) {
  const url = new URL(process.env.GOVBR_AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.GOVBR_CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.GOVBR_REDIRECT_URI);
  url.searchParams.set('scope', process.env.GOVBR_SCOPE || 'openid profile email');
  url.searchParams.set('state', state);
  return url.toString();
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((acc, item) => {
    const [key, ...rest] = item.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function setSessionCookie(res, sessionId) {
  const secure = process.env.NODE_ENV === 'production';
  const cookie = [
    `gov_session=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'gov_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function sendGovError(res, message) {
  res.status(400).send(`<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Falha no gov.br</title>
    <link rel="stylesheet" href="/css/style.css" />
  </head>
  <body data-theme="dark">
    <div class="login-container">
      <div class="login-right">
        <div class="login-form">
          <h3>Não foi possível autenticar</h3>
          <p class="login-form-subtitle">${message}</p>
          <a class="btn-login" href="/index.html">Voltar ao login</a>
        </div>
      </div>
    </div>
  </body>
  </html>`);
}

export function authorizeGov(req, res) {
  const missing = getMissingEnv();
  if (missing.length) {
    return res.status(500).json({
      ok: false,
      message: 'Configuração gov.br incompleta.',
      missing
    });
  }

  cleanStore(stateStore);
  const state = crypto.randomBytes(16).toString('hex');
  stateStore.set(state, { expiresAt: Date.now() + STATE_TTL_MS });

  return res.json({ ok: true, url: buildAuthUrl(state) });
}

export async function callbackGov(req, res) {
  const { code, state } = req.query || {};
  if (!code || !state) {
    return sendGovError(res, 'Código de autorização inválido.');
  }

  cleanStore(stateStore);
  if (!stateStore.has(state)) {
    return sendGovError(res, 'Sessão expirada. Tente novamente.');
  }
  stateStore.delete(state);

  try {
    const tokenRes = await fetch(process.env.GOVBR_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.GOVBR_CLIENT_ID}:${process.env.GOVBR_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: process.env.GOVBR_REDIRECT_URI,
        client_id: process.env.GOVBR_CLIENT_ID,
        client_secret: process.env.GOVBR_CLIENT_SECRET
      })
    });

    if (!tokenRes.ok) {
      return sendGovError(res, 'Falha ao validar o acesso com o gov.br.');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return sendGovError(res, 'Token de acesso inválido.');
    }

    const profileRes = await fetch(process.env.GOVBR_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!profileRes.ok) {
      return sendGovError(res, 'Não foi possível obter seus dados.');
    }

    const profile = await profileRes.json();
    const cpf = extractCpf(profile);
    if (!cpf) {
      return sendGovError(res, 'CPF não localizado no perfil do gov.br.');
    }

    const conn = await conectar();
    const [rows] = await conn.query(
      `SELECT id, matricula, nome, campus, turma, email_academico, email_pessoal,
              descricao_curso, data_nascimento, telefone, cpf
       FROM alunos
       WHERE cpf = ?
       LIMIT 1`,
      [cpf]
    );
    await conn.end();

    if (!rows.length) {
      return sendGovError(res, 'CPF não cadastrado no sistema.');
    }

    const user = rows[0];
    const ADMINS = ['ADMIN'];
    user.role = ADMINS.includes(user.matricula) ? 'ADMIN' : 'ALUNO';

    cleanStore(sessionStore);
    const sessionId = crypto.randomBytes(24).toString('hex');
    sessionStore.set(sessionId, { user, expiresAt: Date.now() + SESSION_TTL_MS });
    setSessionCookie(res, sessionId);
    return res.redirect('/gov-callback.html');
  } catch {
    return sendGovError(res, 'Erro interno ao autenticar.');
  }
}

export function getGovSession(req, res) {
  cleanStore(sessionStore);
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionId = cookies.gov_session;
  if (!sessionId || !sessionStore.has(sessionId)) {
    clearSessionCookie(res);
    return res.status(401).json({ ok: false });
  }

  const session = sessionStore.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    sessionStore.delete(sessionId);
    clearSessionCookie(res);
    return res.status(401).json({ ok: false });
  }

  sessionStore.delete(sessionId);
  clearSessionCookie(res);
  return res.json({ ok: true, user: session.user });
}
