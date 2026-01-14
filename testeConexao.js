import mysql from 'mysql2/promise';

export async function conectar() {
    const conexao = await mysql.createConnection({
        host: 'localhost',
        port: 3308,
        user: 'root',
        password: '251030',
        database: 'banco_dados'
    });

    return conexao;
}