import mysql from 'mysql2/promise';
import 'dotenv/config';

export async function conectar() {
    // Dentro do seu arquivo testeConexao.js
    const connection = await mysql.createConnection({
        host: '192.185.176.152',
        user: 'gesste92_admin',
        password: 'GESSTEC2026.',
        database: 'gesste92_banco_dados'
    });
    return connection;
}