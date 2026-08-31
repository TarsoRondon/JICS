import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3308),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "251030",
    database: process.env.DB_NAME || "banco_dados",
});

try {
    const [rows] = await pool.query("SELECT 1 AS conectado");

    console.log("✅ MySQL conectado!");
    console.log(rows);

    await pool.end();
} catch (error) {
    console.error("❌ Erro ao conectar:");
    console.error(error.message);
}