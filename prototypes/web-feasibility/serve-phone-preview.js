/* global __dirname */
// Preparation-only entry point. Exposure through an HTTPS tunnel needs owner approval.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { probeMiddleware } = require('./server-middleware');
const { phonePreviewGate } = require('./phone-preview-gate');

const runtime = path.join(__dirname, '.runtime');
fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
const access = crypto.randomBytes(16).toString('hex');
const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
fs.writeFileSync(path.join(runtime, 'phone-preview-access.json'), JSON.stringify({ accessCode: access, expiresAt }), { mode: 0o600 });
const root = path.join(__dirname, 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const files = (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { response.writeHead(400); response.end(); return; }
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(`${root}/`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  if (request.method === 'HEAD') response.end(); else fs.createReadStream(file).pipe(response);
};
const server = http.createServer(phonePreviewGate(probeMiddleware(files, __dirname, { allowLegacy: false }), access, { expiresAt }));
server.listen(8096, '127.0.0.1', () => console.log('Phone preview prepared at loopback8096; access protected; expires in2h; legacy endpoint disabled'));
setTimeout(() => server.close(() => process.exit(0)), expiresAt - Date.now());
