import { expect, test } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const plugin = require('../../plugins/with-ios-scene-lifecycle') as {
  applySceneLifecycle: (contents: string) => string;
  stripSceneLifecycle: (contents: string) => string;
  stripLegacySceneWindow: (contents: string) => string;
  METHOD_REGION: string;
  CLASS_REGION: string;
  METHOD_ANCHOR: string;
  APP_DELEGATE_CLASS: string;
  LEGACY_WINDOW_MARKER: string;
};

const makeConfig = require('../../app.config.js') as (input: {
  config: { ios: Record<string, unknown>; plugins: string[] };
}) => { plugins: unknown[] };

const REPO = join(__dirname, '../..');

/**
 * The raw template, captured from a real `expo prebuild` run on 2026-09-17.
 *
 * Comparing against a captured template is the point: if Expo reshapes the
 * template, this fixture stops matching and the suite fails loudly, instead of a
 * device shipping a build that crashes at launch.
 */
const TEMPLATE_FIXTURE = join(__dirname, 'fixtures/ios-app-delegate-template.swift');
const GOLDEN_FIXTURE = join(__dirname, 'fixtures/ios-app-delegate-generated.swift');
const GENERATED_APP_DELEGATE = join(REPO, 'ios/TravelApp/AppDelegate.swift');

/**
 * Captured from the real generated-and-injected AppDelegate on 2026-10-18.
 * Only the Google Maps key and its generated sync hash were redacted. This
 * independent golden file keeps the byte-for-byte assertion portable.
 */
function capturedAppDelegate() {
  return readFileSync(GOLDEN_FIXTURE, 'utf8');
}

/**
 * Masks the two values that legitimately change between runs: the Google Maps
 * key comes from `.env.local`, and the react-native-maps sync hash is derived
 * from it. Everything else is compared byte for byte.
 */
function maskVolatile(contents: string) {
  return contents
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '<GOOGLE_MAPS_API_KEY>')
    .replace(/sync-[0-9a-f]{40}/g, 'sync-<SYNC_HASH>');
}

test('the plugin is registered, before the map plugin it must not disturb', () => {
  const result = makeConfig({ config: { ios: {}, plugins: ['expo-router'] } });
  expect(result.plugins).toContain('./plugins/with-ios-scene-lifecycle');
  expect(result.plugins.indexOf('./plugins/with-ios-scene-lifecycle'))
    .toBeLessThan(result.plugins.findIndex((entry) => (
      Array.isArray(entry) && entry[0] === 'react-native-maps'
    )));
});

test('a fresh prebuild template becomes exactly the captured generated file', () => {
  const template = readFileSync(TEMPLATE_FIXTURE, 'utf8');

  // The captured template really is the template: no injection, and it still
  // carries the legacy window creation the plugin has to remove.
  expect(template).not.toContain(plugin.METHOD_REGION);
  expect(template).not.toContain(plugin.CLASS_REGION);
  expect(template).toContain(plugin.LEGACY_WINDOW_MARKER);

  expect(plugin.applySceneLifecycle(template)).toBe(capturedAppDelegate());
});

const generatedAppDelegateExists = existsSync(GENERATED_APP_DELEGATE);
const testGeneratedAppDelegate = generatedAppDelegateExists ? test : test.skip;
testGeneratedAppDelegate(
  generatedAppDelegateExists
    ? 'generated ios/TravelApp/AppDelegate.swift matches the golden fixture'
    : 'SKIP: ios/TravelApp/AppDelegate.swift is absent; run expo prebuild --platform ios for integration check',
  () => {
    const generated = readFileSync(GENERATED_APP_DELEGATE, 'utf8');
    expect(maskVolatile(generated)).toBe(capturedAppDelegate());
    // A boolean preserves the raw byte-for-byte assertion without printing a
    // real API key in Jest's diff if this integration check fails.
    expect(plugin.applySceneLifecycle(generated) === generated).toBe(true);
  },
);

test('the legacy window creation is removed, and only it', () => {
  const template = readFileSync(TEMPLATE_FIXTURE, 'utf8');
  const stripped = plugin.stripLegacySceneWindow(template);

  expect(template).toContain(plugin.LEGACY_WINDOW_MARKER);
  expect(stripped).not.toContain(plugin.LEGACY_WINDOW_MARKER);
  // The removal must not eat the template's neighbouring content.
  expect(stripped).toContain('reactNativeFactory = factory');
  expect(stripped).toContain('// @generated begin react-native-maps-init');
  expect(stripped).toContain('    return super.application(application, didFinishLaunchingWithOptions: launchOptions)');
  // Already-clean input is left alone.
  expect(plugin.stripLegacySceneWindow(stripped)).toBe(stripped);
});

test('the captured generated file is the plugin\'s own fixed point', () => {
  const file = capturedAppDelegate();
  // Re-applying must be a byte-for-byte no-op, so prebuild can run any number of
  // times without the file drifting.
  expect(plugin.applySceneLifecycle(file)).toBe(file);
  expect(plugin.applySceneLifecycle(plugin.stripSceneLifecycle(file))).toBe(file);
});

test('the injection is idempotent across repeated prebuilds', () => {
  const once = plugin.applySceneLifecycle(readFileSync(TEMPLATE_FIXTURE, 'utf8'));
  expect(plugin.applySceneLifecycle(once)).toBe(once);
  expect(plugin.applySceneLifecycle(plugin.applySceneLifecycle(once))).toBe(once);
});

test('stripping the injection leaves a plausible Expo template', () => {
  const stripped = plugin.stripSceneLifecycle(capturedAppDelegate());

  // The template-owned parts survive untouched.
  expect(stripped).toContain(plugin.APP_DELEGATE_CLASS);
  expect(stripped).toContain(plugin.METHOD_ANCHOR);
  expect(stripped).toContain('class ReactNativeDelegate: ExpoReactNativeFactoryDelegate');
  expect(stripped).toContain('// @generated begin react-native-maps-import');

  // Both hand-written halves are gone, markers included.
  expect(stripped).not.toContain('class SceneDelegate');
  expect(stripped).not.toContain('func startReactNative');
  expect(stripped).not.toContain(plugin.METHOD_REGION);
  expect(stripped).not.toContain(plugin.CLASS_REGION);
});

test('the UIScene adoption is installed in the right places', () => {
  const injected = plugin.applySceneLifecycle(readFileSync(TEMPLATE_FIXTURE, 'utf8'));

  expect(injected).toContain('class SceneDelegate: UIResponder, UIWindowSceneDelegate');
  expect(injected).toContain('window = appDelegate.startReactNative(in: windowScene, launchOptions: nil)');
  // The method has to stay inside the AppDelegate class, before the template's
  // next member, or it would not be reachable from the scene delegate.
  expect(injected.indexOf(plugin.APP_DELEGATE_CLASS)).toBeLessThan(injected.indexOf('func startReactNative('));
  expect(injected.indexOf('func startReactNative(')).toBeLessThan(injected.indexOf(plugin.METHOD_ANCHOR));
  // And the scene delegate has to be at file scope: the region must open right
  // after a type closes, and after the delegate class the template ships.
  expect(injected).toContain(`\n}\n\n// @generated begin ${plugin.CLASS_REGION}`);
  expect(injected.indexOf('class ReactNativeDelegate')).toBeLessThan(injected.indexOf('class SceneDelegate'));
});

test('a reshaped template fails loudly instead of shipping a crash', () => {
  const template = readFileSync(TEMPLATE_FIXTURE, 'utf8');
  const stripped = plugin.stripSceneLifecycle(capturedAppDelegate());

  expect(() => plugin.applySceneLifecycle(template.replace(plugin.METHOD_ANCHOR, '  // Linking')))
    .toThrow(/no longer contains the anchor/);
  expect(() => plugin.applySceneLifecycle(template.replace(plugin.APP_DELEGATE_CLASS, 'class AppDelegate: UIResponder')))
    .toThrow(/no longer contains "class AppDelegate: ExpoAppDelegate"/);

  // A legacy window block in an unrecognised shape would leave two windows, so it
  // must not pass silently.
  const reshapedWindow = template.replace('      in: window,', '      in: someWindow,');
  expect(reshapedWindow).toContain(plugin.LEGACY_WINDOW_MARKER);
  expect(() => plugin.applySceneLifecycle(reshapedWindow))
    .toThrow(/still creates a window from/);

  // Stripping the injection from the real file is stable, too.
  expect(plugin.stripSceneLifecycle(stripped)).toBe(stripped);
});
