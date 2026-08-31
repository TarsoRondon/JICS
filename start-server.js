#!/usr/bin/env node

'use strict';

const { execSync } = require('child_process');
const net = require('net');
const fs = require('fs');

// Config
const PORTS = [8080, 3000, 5000];
let availablePort = null;

// 1. Testar portas livres
for (const port of PORTS) {
    const server = net.createServer();
    server.once('error', () => {});
    server.once('listening', () => {
        server.close();
        availablePort = port;
    });
    server.listen(port, '127.0.0.1');
}

// 2. Matar processo se porta ocupada
function killProcess(port) {
    try {
        // Windows: netstat + taskkill
        if (process.platform === 'win32') {
            const pid = execSync(`netstat -ano | findstr :${port} | findstr LISTENING | for /f "tokens=5" %i in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /PID %i /F`, { encoding: 'utf8', stdio: 'ignore' });
        } else {
            // Linux/Mac
            execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
        }
        console.log(`✅ Porta ${port} liberada`);
    } catch (e) {
        console.log(`⚠️  Não foi possível matar processo na porta ${port}`);
    }
}

// 3. Main
async function start() {
    console.log('🚀 Iniciando servidor JICS (porta auto)...');

    // Matar processos antigos
    for (const port of PORTS) {
        killProcess(port);
    }

    // Aguardar 1s para liberação
    await new Promise(r => setTimeout(r, 1000));

    // Escolher primeira porta livre
    let port = 8080;
    const tester = net.createServer();
    tester.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            port = 3000;
        }
    });
    tester.on('listening', () => {
        tester.close();
    });
    tester.listen(port);

    // Executar server.js
    try {
        console.log(`🌐 Servidor JICS rodando → http://localhost:${port}`);
        execSync(`PORT=${port} node server.js`, { stdio: 'inherit' });
    } catch (e) {
        console.error('❌ Erro:', e.message);
        process.exit(1);
    }
}

start();