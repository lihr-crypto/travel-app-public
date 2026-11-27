function workerSource(build, assets) {
  return String.raw`/* PROTOTYPE: caches app assets only; never itinerary/API/map responses. */
const BUILD = ${JSON.stringify(build)};
const PREFIX = 'travel-web-probe-shell-';
const CACHE = PREFIX + BUILD;
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(async error => {
    await caches.delete(CACHE); throw error;
  }));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const previous = (await caches.keys()).filter(name => name.startsWith(PREFIX) && name !== CACHE);
    // Keep previous assets for live old tabs; never touch IndexedDB or other apps' caches.
    if (windows.length <= 1) for (const name of previous.slice(0, -1)) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'APPLY_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'SHELL_STATUS') event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const ready = (await Promise.all(ASSETS.map(asset => cache.match(asset)))).every(Boolean);
    event.source?.postMessage({ type: 'SHELL_STATUS', build: BUILD, ready, assets: ASSETS.length });
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/__probe/') || url.pathname.startsWith('/_AMapService/')) return;
  const navigation = request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname);
  const staticAsset = ASSETS.includes(url.pathname) || /^\/(?:_expo\/static|assets)\/.+\.(?:js|png|ico|woff2?)$/.test(url.pathname);
  if (!navigation && !staticAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(navigation ? '/index.html' : request, { ignoreSearch: true });
    if (cached) return cached;
    if (!navigation) {
      for (const name of (await caches.keys()).filter(name => name.startsWith(PREFIX))) {
        const old = await (await caches.open(name)).match(request, { ignoreSearch: true });
        if (old) return old;
      }
    }
    return fetch(request);
  })());
});
`;
}

module.exports = { workerSource };
