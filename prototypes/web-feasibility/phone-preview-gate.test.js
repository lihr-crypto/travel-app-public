const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const { phonePreviewGate } = require('./phone-preview-gate');
const { probeMiddleware } = require('./server-middleware');

test('temporary preview requires a code, expires, and never serves native backup records even after login', async () => {
  let clock = 100;
  const access = 'test-only-code';
  const server = http.createServer(phonePreviewGate(probeMiddleware((request, response) => { response.end('public fixture'); }, process.cwd(), { allowLegacy: false }), access, { expiresAt: 10000, now: () => clock }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const denied = await fetch(`${origin}/__probe/config`);
    assert.equal(denied.status, 401); assert.equal((await denied.text()).includes(access), false);
    const wrong = await fetch(`${origin}/__phone_login`, { method: 'POST', body: 'code=wrong', redirect: 'manual' });
    assert.equal(wrong.status, 401);
    const unicode = await fetch(`${origin}/__phone_login`, { method: 'POST', body: new URLSearchParams({ code: '界'.repeat(access.length) }), redirect: 'manual' });
    assert.equal(unicode.status, 401);
    const login = await fetch(`${origin}/__phone_login`, { method: 'POST', body: `code=${access}`, redirect: 'manual' });
    assert.equal(login.status, 303); assert.match(login.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
    const headers = { cookie: `travel_probe_access=${access}` };
    assert.equal(await (await fetch(`${origin}/`, { headers })).text(), 'public fixture');
    const backup = await fetch(`${origin}/__probe/legacy`, { headers });
    assert.equal(backup.status, 404); assert.equal((await backup.json()).error, 'LEGACY_LOCAL_ONLY');
    clock = 10001;
    assert.equal((await fetch(`${origin}/`, { headers })).status, 410);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
