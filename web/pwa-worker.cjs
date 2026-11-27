const { workerSource } = require('../prototypes/web-feasibility/pwa-worker');

function buildWorkerSource(build, assets) {
  let source = workerSource(build, assets).replace('travel-web-probe-shell-', 'travel-web-plan-shell-').replace('/* PROTOTYPE:', '/* Travel PWA:');
  source = source.replace("['/', '/index.html'].includes(url.pathname)", "(['/', '/index.html'].includes(url.pathname) || /^\\/trip\\/[^/]+(?:\\/day\\/[^/]+|\\/unscheduled)?\\/?$/.test(url.pathname))");
  source = source.replace("url.pathname.startsWith('/__probe/') ||", "url.pathname.startsWith('/api/') || url.pathname.startsWith('/__probe/') ||");
  source = source.replace('cache.addAll(ASSETS)', `Promise.all(ASSETS.map(async asset => {
    const response = await fetch(asset, { credentials: 'same-origin', cache: 'reload', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!response.ok || response.redirected) throw new Error('SHELL_ACCESS_UNAVAILABLE');
    const type = response.headers.get('content-type') || '';
    if (asset.endsWith('.js') && !type.includes('javascript')) throw new Error('INVALID_SHELL_RESPONSE');
    if (asset.endsWith('.css') && !type.includes('text/css')) throw new Error('INVALID_SHELL_RESPONSE');
    if (asset.endsWith('.html') && !type.includes('text/html')) throw new Error('INVALID_SHELL_RESPONSE');
    await cache.put(asset, response);
  }))`);
  return source;
}
module.exports = { buildWorkerSource };
