/* Servidor estatico minimo, sem dependencias.
   Precisa rodar em http://localhost porque o navegador so libera a
   geolocalizacao em contexto seguro (localhost ou https). */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 permite acessar pelo celular na mesma rede

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);

  // impede escapar da pasta do projeto
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Acesso negado');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nao encontrado: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      // o app nativo consulta a base de outra origem (https://localhost)
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  const nets = require('os').networkInterfaces();
  const lan = [];
  Object.keys(nets).forEach((name) => {
    nets[name].forEach((n) => {
      if (n.family === 'IPv4' && !n.internal) lan.push(n.address);
    });
  });

  console.log('');
  console.log('  Pandax - MAP');
  console.log('  -------------------------------------------');
  console.log('  Computador:  http://localhost:' + PORT);
  lan.forEach((ip) => {
    console.log('  Celular:     http://' + ip + ':' + PORT + '   (mesma rede Wi-Fi)');
  });
  console.log('');
  console.log('  Ctrl+C para encerrar.');
  console.log('');
});