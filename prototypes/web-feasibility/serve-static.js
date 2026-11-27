/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { probeMiddleware } = require('./server-middleware');

const root = path.join(__dirname, 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css', '.ico': 'image/x-icon' };
const files = (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(`${root}/`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
};
http.createServer(probeMiddleware(files, __dirname)).listen(8095, '127.0.0.1', () => console.log('Production probe: http://127.0.0.1:8095 (loopback only)'));

