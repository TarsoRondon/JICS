import mysql from 'mysql2/promise';

export async function conectar() {
    const conexao = await mysql.createConnection({
        host: 'localhost',
        port: 3308,
        user: 'appuser',
        password: '123456',
        database: 'banco_dados'
    });

    return conexao;
}