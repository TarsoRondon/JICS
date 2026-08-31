import mysql from 'mysql2/promise';

// Pool centralizado (SaaS/admin). Mantem defaults compativeis com testeConexao.js
// para rodar local sem exigir .env imediatamente.
export const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3308),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '251030',
    database: process.env.DB_NAME || 'banco_dados',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
    queueLimit: 0,
    namedPlaceholders: true,
});

export async function dbQuery(sql, params = {}) {
    const [rows] = await pool.query(sql, params);
    return rows;
}