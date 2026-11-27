import { afterEach, expect, test } from '@jest/globals';

const makeConfig = require('../../app.config.js') as (input: {
  config: { ios: Record<string, unknown>; plugins: string[] };
}) => {
  ios: Record<string, unknown>;
  plugins: unknown[];
};

const originalGoogle = process.env.GOOGLE_MAPS_IOS_API_KEY;
const originalAmap = process.env.AMAP_IOS_API_KEY;
const originalRequire = process.env.EXPO_MAPS_REQUIRE_KEYS;

afterEach(() => {
  if (originalGoogle === undefined) delete process.env.GOOGLE_MAPS_IOS_API_KEY;
  else process.env.GOOGLE_MAPS_IOS_API_KEY = originalGoogle;
  if (originalAmap === undefined) delete process.env.AMAP_IOS_API_KEY;
  else process.env.AMAP_IOS_API_KEY = originalAmap;
  if (originalRequire === undefined) delete process.env.EXPO_MAPS_REQUIRE_KEYS;
  else process.env.EXPO_MAPS_REQUIRE_KEYS = originalRequire;
});

function config() {
  return makeConfig({ config: { ios: {}, plugins: ['expo-router'] } });
}

test('uses a stable development bundle ID without inventing provider keys', () => {
  delete process.env.GOOGLE_MAPS_IOS_API_KEY;
  delete process.env.AMAP_IOS_API_KEY;
  delete process.env.EXPO_MAPS_REQUIRE_KEYS;
  delete process.env.EXPO_APPLE_TEAM_ID;

  const result = config();
  expect(result.ios.bundleIdentifier).toBe('com.example.travelapp.dev');
  expect(result.ios.appleTeamId).toBeUndefined();
  expect(result.ios.infoPlist).not.toHaveProperty('AMapApiKey');
  expect(result.ios.infoPlist).toHaveProperty('LSApplicationQueriesSchemes', ['iosamap']);
  expect(result.plugins).toContainEqual([
    'react-native-maps', { iosGoogleMapsApiKey: undefined },
  ]);
});

test('adds the AMap app scheme without discarding existing query schemes', () => {
  delete process.env.GOOGLE_MAPS_IOS_API_KEY;
  delete process.env.AMAP_IOS_API_KEY;
  delete process.env.EXPO_MAPS_REQUIRE_KEYS;

  const result = makeConfig({
    config: {
      ios: { infoPlist: { LSApplicationQueriesSchemes: ['mapsapp', 'iosamap'] } },
      plugins: [],
    },
  });
  expect(result.ios.infoPlist).toHaveProperty(
    'LSApplicationQueriesSchemes',
    ['mapsapp', 'iosamap'],
  );
});

test('wires supplied native keys but requires both for a full map build', () => {
  process.env.GOOGLE_MAPS_IOS_API_KEY = 'test-google-key';
  process.env.AMAP_IOS_API_KEY = 'test-amap-key';
  process.env.EXPO_MAPS_REQUIRE_KEYS = '1';
  const result = config();
  expect(result.ios.infoPlist).toHaveProperty('AMapApiKey', 'test-amap-key');
  expect(result.plugins).toContainEqual([
    'react-native-maps', { iosGoogleMapsApiKey: 'test-google-key' },
  ]);

  delete process.env.AMAP_IOS_API_KEY;
  expect(() => config()).toThrow('Map build requires');
});
