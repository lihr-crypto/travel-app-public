const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const repo = path.resolve(__dirname, '..');
const modules = path.join(repo, 'prototypes/web-feasibility/.deps/node_modules');
const config = getDefaultConfig(__dirname);
const original = config.resolver.resolveRequest;
config.watchFolders = [...config.watchFolders, repo, modules];
config.resolver.nodeModulesPaths = [path.join(repo, 'node_modules'), modules];
config.resolver.resolveRequest = (context, input, platform) => {
  let name = input;
  if (name.startsWith('@/')) name = path.join(repo, 'src', name.slice(2));
  const absolute = path.isAbsolute(name) ? name : name.startsWith('.') ? path.resolve(path.dirname(context.originModulePath), name) : null;
  if (platform === 'web' && absolute?.replace(/\.tsx?$/, '') === path.join(repo, 'src/components/gesture-debug')) name = path.join(__dirname, 'src/gesture-debug.js');
  if (platform === 'web' && name === 'react-native') name = path.join(modules, 'react-native-web');
  if (name === 'react' || name.startsWith('react/') || name === 'react-dom' || name.startsWith('react-dom/')) name = path.join(repo, 'node_modules', name);
  return original ? original(context, name, platform) : context.resolveRequest(context, name, platform);
};
module.exports = config;
