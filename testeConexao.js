import mysql from 'mysql2/promise';
import 'dotenv/config';

export async function conectar() {
    const conexao = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3308),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '251030',
        database: process.env.DB_NAME || 'banco_dados'
    });

    return conexao;
}
