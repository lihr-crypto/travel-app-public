const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { workerSource } = require('./pwa-worker');

function browserWorker({ windows = 1, failInstall = false } = {}) {
  const events = {};
  const databases = new Map();
  const cache = (name) => {
    if (!databases.has(name)) databases.set(name, new Map());
    const entries = databases.get(name);
    const key = (value) => new URL(typeof value === 'string' ? value : value.url, 'http://127.0.0.1:8095').pathname;
    return {
      addAll: async (assets) => { if (failInstall) throw new Error('INCOMPLETE_NETWORK'); assets.forEach(asset => entries.set(key(asset), new Response(`${name}:${asset}`))); },
      match: async (request) => entries.get(key(request))?.clone(),
    };
  };
  let skipped = 0;
  const self = {
    location: { origin: 'http://127.0.0.1:8095' },
    addEventListener: (name, handler) => { events[name] = handler; },
    clients: { matchAll: async () => Array.from({ length: windows }, () => ({})), claim: async () => {} },
    skipWaiting: async () => { skipped += 1; },
  };
  vm.runInNewContext(workerSource('new', ['/index.html', '/_expo/static/main.js']), {
    self, URL, caches: { open: async (name) => cache(name), keys: async () => [...databases.keys()], delete: async (name) => databases.delete(name) },
    fetch: async () => { throw new Error('OFFLINE'); },
  });
  const dispatch = async (type, data = {}) => {
    let pending;
    let response;
    events[type]({ ...data, waitUntil: (promise) => { pending = promise; }, respondWith: (promise) => { response = promise; } });
    if (pending) await pending;
    return response ? await response : undefined;
  };
  return { dispatch, databases, cache, skipped: () => skipped };
}

test('warmed app shell opens offline; APIs, private backups and third-party map tiles bypass the cache', async () => {
  const worker = browserWorker();
  await worker.dispatch('install');
  const response = await worker.dispatch('fetch', { request: { url: 'http://127.0.0.1:8095/', method: 'GET', mode: 'navigate' } });
  assert.match(await response.text(), /index.html/);
  for (const path of ['/__probe/config', '/__probe/legacy', '/_AMapService/v3/place/text', '/private/backup.json']) {
    assert.equal(await worker.dispatch('fetch', { request: { url: `http://127.0.0.1:8095${path}`, method: 'GET' } }), undefined);
  }
  assert.equal(await worker.dispatch('fetch', { request: { url: 'https://maps.googleapis.com/map', method: 'GET' } }), undefined);
  assert.equal(await worker.dispatch('fetch', { request: { url: 'http://127.0.0.1:8095/_expo/static/main.js', method: 'POST' } }), undefined);
});

test('failed shell installation leaves the previous working cache intact', async () => {
  const worker = browserWorker({ failInstall: true });
  await worker.cache('travel-web-probe-shell-old').addAll([]).catch(() => {});
  worker.databases.get('travel-web-probe-shell-old').set('/index.html', new Response('old shell'));
  await assert.rejects(worker.dispatch('install'), /INCOMPLETE_NETWORK/);
  assert.equal(worker.databases.has('travel-web-probe-shell-new'), false);
  assert.equal(await (await worker.cache('travel-web-probe-shell-old').match('/index.html')).text(), 'old shell');
});

test('updates wait for an explicit action; active old tabs keep their assets and unrelated caches survive', async () => {
  const worker = browserWorker({ windows: 2 });
  for (const name of ['another-app', 'travel-web-probe-shell-oldest', 'travel-web-probe-shell-old']) await worker.cache(name).addAll([]);
  await worker.dispatch('install');
  assert.equal(worker.skipped(), 0);
  await worker.dispatch('activate');
  assert.equal(worker.databases.has('another-app'), true);
  assert.equal(worker.databases.has('travel-web-probe-shell-oldest'), true);
  await worker.dispatch('message', { data: { type: 'APPLY_UPDATE' } });
  assert.equal(worker.skipped(), 1);
});

test('a single active page retains one previous build; cache readiness requires every shell asset', async () => {
  const worker = browserWorker();
  for (const name of ['another-app', 'travel-web-probe-shell-oldest', 'travel-web-probe-shell-old']) await worker.cache(name).addAll([]);
  await worker.dispatch('install'); await worker.dispatch('activate');
  assert.equal(worker.databases.has('another-app'), true);
  assert.equal(worker.databases.has('travel-web-probe-shell-oldest'), false);
  assert.equal(worker.databases.has('travel-web-probe-shell-old'), true);
  const reports = [];
  const source = { postMessage: (value) => reports.push(value) };
  await worker.dispatch('message', { data: { type: 'SHELL_STATUS' }, source });
  assert.equal(reports[0].ready, true);
  worker.databases.get('travel-web-probe-shell-new').delete('/_expo/static/main.js');
  await worker.dispatch('message', { data: { type: 'SHELL_STATUS' }, source });
  assert.equal(reports[1].ready, false);
});
