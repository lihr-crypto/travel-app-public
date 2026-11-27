const assert = require('node:assert/strict');
const { test } = require('node:test');
const { probeMiddleware } = require('./server-middleware');

test('local AMap proxy uses the SDK-required first-level route and keeps the security code server-side', async () => {
  const previous = { fetch: global.fetch, key: process.env.AMAP_WEB_API_KEY, security: process.env.AMAP_WEB_SECURITY_CODE };
  process.env.AMAP_WEB_API_KEY = 'test-web-key';
  process.env.AMAP_WEB_SECURITY_CODE = 'test-server-secret';
  const targets = [];
  global.fetch = async (target) => {
    targets.push(target);
    return { status: 200, headers: new Headers({ 'content-type': 'application/javascript' }), text: async () => 'callback({"status":"1"})' };
  };
  const request = async (url, method = 'GET', remoteAddress = '127.0.0.1') => {
    const result = {};
    await probeMiddleware(() => { result.fallback = true; }, process.cwd())(
      { url, method, socket: { remoteAddress } },
      { writeHead(status, headers) { result.status = status; result.headers = headers; }, end(body) { result.body = body; } },
    );
    return result;
  };
  try {
    const search = await request('/_AMapService/v3/place/text?keywords=test&key=caller-key&jscode=caller-secret&callback=callback');
    assert.equal(search.status, 200);
    assert.equal(search.body, 'callback({"status":"1"})');
    assert.equal(targets[0].origin, 'https://restapi.amap.com');
    assert.equal(targets[0].searchParams.get('key'), 'test-web-key');
    assert.equal(targets[0].searchParams.get('jscode'), 'test-server-secret');
    assert.equal(targets[0].searchParams.get('callback'), 'callback');
    assert.equal(targets[0].searchParams.getAll('jscode').length, 1);

    assert.equal((await request('/_AMapService/v4/map/styles')).status, 200);
    assert.equal(targets[1].origin, 'https://webapi.amap.com');
    assert.equal((await request('/_AMapService/v3/place/text', 'POST')).status, 405);
    assert.equal((await request('/_AMapService/v3/place/text', 'GET', '192.0.2.1')).status, 403);
    assert.equal((await request('/_AMapService/not-an-api')).status, 400);
    assert.equal(targets.length, 2);
    const config = await request('/__probe/config');
    assert.equal(JSON.parse(config.body).amapSecurityConfigured, true);
    assert.equal(config.body.includes('test-server-secret'), false);
    assert.equal((await request('/')).fallback, true);
  } finally {
    global.fetch = previous.fetch;
    for (const [name, value] of [['AMAP_WEB_API_KEY', previous.key], ['AMAP_WEB_SECURITY_CODE', previous.security]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
