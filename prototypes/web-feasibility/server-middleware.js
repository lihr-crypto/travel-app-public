const fs = require('node:fs');
const path = require('node:path');

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function probeMiddleware(middleware, projectRoot, options = {}) {
  return async (request, response, next) => {
    const url = new URL(request.url, 'http://localhost');
    const amapProxy = url.pathname.startsWith('/_AMapService/');
    if (!url.pathname.startsWith('/__probe/') && !amapProxy) return middleware(request, response, next);
    const remote = request.socket?.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
      return json(response, 403, { error: 'LOOPBACK_ONLY' });
    }
    if (request.method !== 'GET') return json(response, 405, { error: 'READ_ONLY_ENDPOINT' });
    if (url.pathname === '/__probe/health') {
      return json(response, 200, { application: 'travel-web-feasibility', pid: process.pid });
    }
    if (url.pathname === '/__probe/config') {
      return json(response, 200, {
        amapWebKey: process.env.AMAP_WEB_API_KEY || '',
        amapSecurityConfigured: Boolean(process.env.AMAP_WEB_SECURITY_CODE),
        googleWebKey: process.env.GOOGLE_MAPS_WEB_API_KEY || '',
      });
    }
    if (url.pathname === '/__probe/legacy') {
      if (options.allowLegacy === false) return json(response, 404, { error: 'LEGACY_LOCAL_ONLY' });
      const file = path.join(projectRoot, 'private/legacy-backup.json');
      if (!fs.existsSync(file)) return json(response, 404, { error: 'NO_LOCAL_BACKUP_FIXTURE' });
      // The prototype server binds to loopback. Original data never goes to map APIs.
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return response.end(fs.readFileSync(file));
    }
    if (amapProxy) {
      const key = process.env.AMAP_WEB_API_KEY;
      const security = process.env.AMAP_WEB_SECURITY_CODE;
      if (!key || !security) return json(response, 503, { error: 'AMAP_WEB_KEYS_NOT_CONFIGURED' });
      const suffix = url.pathname.slice('/_AMapService'.length);
      if (!/^\/v[345]\/[a-zA-Z0-9_/-]+$/.test(suffix)) return json(response, 400, { error: 'INVALID_PROXY_PATH' });
      const target = new URL(suffix, suffix === '/v4/map/styles' ? 'https://webapi.amap.com' : 'https://restapi.amap.com');
      for (const [name, value] of url.searchParams) {
        if (name !== 'key' && name !== 'jscode') target.searchParams.append(name, value);
      }
      target.searchParams.set('key', key);
      target.searchParams.set('jscode', security);
      try {
        const upstream = await fetch(target, { signal: AbortSignal.timeout(15000) });
        response.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(await upstream.text());
      } catch {
        json(response, 502, { error: 'AMAP_NETWORK_UNAVAILABLE' });
      }
      return;
    }
    return json(response, 404, { error: 'UNKNOWN_PROBE_ENDPOINT' });
  };
}

module.exports = { probeMiddleware };

