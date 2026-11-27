const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');

function phonePreviewGate(handler, accessCode, { expiresAt, now = () => Date.now() }) {
  const expected = Buffer.from(accessCode);
  const equal = (value) => {
    if (typeof value !== 'string') return false;
    const supplied = Buffer.from(value);
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  };
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
  return (request, response) => {
    if (now() >= expiresAt) { response.writeHead(410, headers); response.end('临时验证入口已到期'); return; }
    const url = new URL(request.url, 'http://localhost');
    const cookies = String(request.headers.cookie || '').split(';').map(value => value.trim());
    const cookie = cookies.find(value => value.startsWith('travel_probe_access='))?.slice('travel_probe_access='.length);
    if (equal(cookie)) return handler(request, response);
    if (request.method === 'POST' && url.pathname === '/__phone_login') {
      let body = '';
      request.on('data', chunk => { body += chunk; if (body.length > 2048) request.destroy(); });
      request.on('end', () => {
        if (!equal(new URLSearchParams(body).get('code'))) { response.writeHead(401, headers); response.end('访问码不正确，请返回后重试'); return; }
        response.writeHead(303, { ...headers, Location: '/', 'Set-Cookie': `travel_probe_access=${accessCode}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor((expiresAt - now()) / 1000)}` });
        response.end();
      });
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, headers); response.end(); return; }
    response.writeHead(401, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Travel 临时验证</title><style>body{background:#f5f2ea;color:#26392f;font:17px -apple-system,sans-serif;padding:28px;max-width:440px;margin:40px auto}input,button{box-sizing:border-box;width:100%;font:inherit;padding:14px;border-radius:12px;border:1px solid #ccd6cd;margin:8px 0}button{background:#17584c;color:white}</style><h1>Travel 临时验证</h1><p>仅用于公共样例测试。原 App 数据和旧行程备份不会由此入口提供。</p><form method="post" action="/__phone_login"><label>访问码<input name="code" type="password" autocomplete="off" required></label><button type="submit">打开验证页</button></form></html>');
  };
}

module.exports = { phonePreviewGate };
