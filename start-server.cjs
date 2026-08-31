#!/usr/bin/env node

'use strict';

const { execSync } = require('child_process');
const net = require('net');

// Config
const PORTS = [8080, 3000, 5000];

function killPort(port) {
    try {
        if (process.platform === 'win32') {
            // Windows: netstat + taskkill
            const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
            const lines = output.split('\\r?\\n').filter(Boolean);
            for (const line of lines) {
                const match = line.match(/:\\s+([0-9]+)/);
                if (match) {
                    const pid = match[1];
                    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
                }
            }
        } else {
            // Linux/Mac
            execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
        }
        console.log(`🔧 Porta ${port} liberada`);
    } catch (e) {
        console.log(`⚠️ Porta ${port} livre ou sem permissão`);
    }
}

async function findFreePort() {
    for (const port of PORTS) {
        const server = net.createServer();
        return new Promise((resolve) => {
            server.on('error', () => resolve(null));
            server.on('listening', () => {
                server.close();
                resolve(port);
            });
            server.listen(port, '127.0.0.1');
        });
    }
    return 3000;
}

async function main() {
    console.log('🚀 JICS Server Starter - Anti-EADDRINUSE');

    // Kill processos antigos
    for (const port of PORTS) killPort(port);

    // Wait liberação
    await new Promise(r => setTimeout(r, 1500));

    // Porta livre
    const port = await findFreePort();
    console.log(`✅ Porta livre: ${port}`);

    // Rodar server.js
    console.log(`🌐 http://localhost:${port}`);
    try {
        execSync(`PORT=${port} node server.js`, {
            stdio: 'inherit',
            env: {...process.env, PORT: String(port) }
        });
    } catch (e) {
        console.error('❌ Server erro:', e.message);
        process.exit(1);
    }
}

main();