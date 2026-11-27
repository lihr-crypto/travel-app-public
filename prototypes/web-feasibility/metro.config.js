const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { probeMiddleware } = require('./server-middleware');

const repoRoot = path.resolve(__dirname, '../..');
const webModules = path.join(__dirname, '.deps/node_modules');
const config = getDefaultConfig(__dirname);
const originalResolver = config.resolver.resolveRequest;
config.watchFolders = [...config.watchFolders, repoRoot, webModules];
config.resolver.nodeModulesPaths = [path.join(repoRoot, 'node_modules'), webModules];
config.resolver.resolveRequest = (context, name, platform) => {
  if (name.startsWith('@/')) name = path.join(repoRoot, 'src', name.slice(2));
  const origin = context.originModulePath;
  const absolute = path.isAbsolute(name) ? name
    : name.startsWith('.') && origin ? path.resolve(path.dirname(origin), name) : null;
  if (platform === 'web' && absolute?.replace(/\.tsx?$/, '') === path.join(repoRoot, 'src/components/gesture-debug')) {
    // Native SQLite debug logging is not part of the persistence being probed.
    name = path.join(__dirname, 'browser-gesture-debug.js');
  }
  if (platform === 'web' && name === 'react-native') {
    name = path.join(webModules, 'react-native-web');
  }
  if (name === 'react' || name.startsWith('react/') || name === 'react-dom' || name.startsWith('react-dom/')) {
    name = path.join(repoRoot, 'node_modules', name);
  }
  return originalResolver
    ? originalResolver(context, name, platform)
    : context.resolveRequest(context, name, platform);
};
const enhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) =>
  probeMiddleware(enhance ? enhance(middleware, server) : middleware, __dirname);
module.exports = config;

