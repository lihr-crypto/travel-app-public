// Isolated prototype export packaging. No environment credentials enter dist.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { workerSource } = require('./pwa-worker');
const { generateImageAsync } = require('@expo/image-utils');

async function main() {
const root = path.join(process.cwd(), 'dist');
const htmlPath = path.join(root, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<link[^>]+(?:rel="manifest"|rel="apple-touch-icon")[^>]*>\s*/g, '')
  .replace(/<meta name="(?:pwa-build|apple-mobile-web-app-capable|apple-mobile-web-app-title)"[^>]*>\s*/g, '');
html = html.replace('<html lang="en">', '<html lang="zh-CN">');
const manifest = { id: '/', name: 'Travel Web 验证', short_name: 'Travel 验证', start_url: '/', scope: '/', display: 'standalone', theme_color: '#F5F2EA', background_color: '#F5F2EA', icons: [192, 512].map(size => ({ src: `/pwa-icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })) };
for (const size of [180, 192, 512]) {
  const image = await generateImageAsync({ projectRoot: process.cwd() }, { src: path.resolve('../../assets/icon.png'), width: size, height: size, resizeMode: 'contain', name: `pwa-icon-${size}.png` });
  fs.writeFileSync(path.join(root, `pwa-icon-${size}.png`), image.source);
}
fs.writeFileSync(path.join(root, 'manifest.webmanifest'), JSON.stringify(manifest));
const files = (folder) => fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(folder, entry.name)) : [path.join(folder, entry.name)]);
const assets = files(root).filter((file) => /\.(?:js|png|ico|webmanifest)$/.test(file) && !file.endsWith('/sw.js')).sort();
const digest = crypto.createHash('sha256').update(html);
assets.forEach((file) => digest.update(path.relative(root, file)).update(fs.readFileSync(file)));
const label = process.argv.find((arg) => arg.startsWith('--probe-label='))?.slice('--probe-label='.length) ?? '';
if (!/^[a-zA-Z0-9-]{0,40}$/.test(label)) throw new Error('INVALID_PROBE_LABEL');
const build = `${digest.digest('hex').slice(0, 12)}${label ? `-${label}` : ''}`;
html = html.replace('</head>', `<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/pwa-icon-180.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Travel 验证"><meta name="pwa-build" content="${build}"></head>`);
fs.writeFileSync(htmlPath, html);
const precache = ['/index.html', ...assets.map((file) => `/${path.relative(root, file).split(path.sep).join('/')}`)];
fs.writeFileSync(path.join(root, 'sw.js'), workerSource(build, precache));
console.log(`PWA export ${build}: ${precache.length} same-origin shell assets; API/map data excluded`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
