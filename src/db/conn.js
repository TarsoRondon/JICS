import mysql from 'mysql2/promise';

// Pool centralizado (SaaS/admin). Mantem defaults compativeis com testeConexao.js
// para rodar local sem exigir .env imediatamente.
export const pool = mysql.createPool({
    host: process.env.DB_HOST || '192.185.176.152',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'gesste92_admin',
    password: process.env.DB_PASSWORD || 'GESSTEC2026.',
    database: process.env.DB_NAME || 'gesste92_banco_dados',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
    queueLimit: 0,
    namedPlaceholders: true,
});

export async function dbQuery(sql, params = {}) {
    const [rows] = await pool.query(sql, params);
    return rows;
}