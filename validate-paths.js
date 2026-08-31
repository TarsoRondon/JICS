import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) results = results.concat(walk(filePath));
    else if (file.endsWith('.html')) results.push(filePath);
  });
  return results;
}

const htmlFiles = walk('public');
console.log(`Analisando ${htmlFiles.length} arquivos HTML em public/...`);

const missing = [];
const checked = new Set();

htmlFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const regex = /(?:src|href)=["']([^"':#?]+)["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const url = match[1];
    // Rotas HTTP externas e prefixos de runtime do servidor
    if (url.startsWith('http') || url.startsWith('//') || url.startsWith('data:') || url.startsWith('mailto:')) continue;
    if (url.endsWith('.com') || url.endsWith('.br') || url.endsWith('.org')) continue;
    // Rotas servidas pelo Express em runtime (não são arquivos físicos)
    const runtimeRoutes = ['/telao', '/socket.io', '/login', '/auth', '/api', '/dashboard'];
    if (runtimeRoutes.some(r => url === r || url.startsWith(r + '/'))) continue;
    
    let targetPath;
    if (url.startsWith('/')) {
      targetPath = path.join('public', url.slice(1));
    } else {
      targetPath = path.join(path.dirname(file), url);
    }
    
    const key = `${file} -> ${url}`;
    if (!checked.has(key)) {
      checked.add(key);
      if (!fs.existsSync(targetPath)) {
        missing.push({ file: path.relative('.', file), ref: url, resolved: targetPath });
      }
    }
  }
});

if (missing.length === 0) {
  console.log('✔ TUDO CERTO! Todos os links, estilos, scripts e imagens locais existem no disco.');
} else {
  console.log(`⚠️ Encontradas ${missing.length} referências inconsistentes:`);
  missing.forEach(m => console.log(`  Arquivo: ${m.file} | Link: ${m.ref} -> ${m.resolved}`));
}
