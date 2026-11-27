/* global __dirname */
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

execFileSync('npm', ['install', '--prefix', '.deps', '--legacy-peer-deps', '--no-audit', '--no-fund',
  'react-native-web@~0.21.0', 'react@19.2.3', 'react-dom@19.2.3', '@expo/metro-runtime@~57.0.15'],
{ cwd: __dirname, stdio: 'inherit' });
for (const name of ['react-native-web', '@expo/metro-runtime']) {
  const link = path.join(__dirname, 'node_modules', name);
  fs.mkdirSync(path.dirname(link), { recursive: true });
  if (!fs.existsSync(link)) fs.symlinkSync(path.join(__dirname, '.deps/node_modules', name), link, 'dir');
}

