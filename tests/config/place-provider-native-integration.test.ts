import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@jest/globals';

const root = join(__dirname, '../..');

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('pins each official Place SDK behind a separate thin Expo module', () => {
  const amapPodspec = read(
    'modules/expo-amap-search/ios/ExpoAmapSearch.podspec',
  );
  const googlePodspec = read(
    'modules/expo-google-places/ios/ExpoGooglePlaces.podspec',
  );

  expect(amapPodspec).toContain("s.dependency 'AMapSearch', '9.8.1'");
  expect(googlePodspec).toContain(
    "s.dependency 'GooglePlacesSwift', '10.15.0'",
  );
  expect(googlePodspec).toContain("s.dependency 'GoogleMaps', '9.4.0'");
  expect(read('modules/expo-amap-search/expo-module.config.json')).toContain(
    'ExpoAmapSearchModule',
  );
  expect(
    read('modules/expo-google-places/expo-module.config.json'),
  ).toContain('ExpoGooglePlacesModule');
});

test('locks native key initialization and AMap privacy fail-closed behavior', () => {
  const amapModule = read(
    'modules/expo-amap-search/ios/ExpoAmapSearchModule.swift',
  );
  const googleModule = read(
    'modules/expo-google-places/ios/ExpoGooglePlacesModule.swift',
  );

  expect(amapModule).toContain('AMapSearchAPI.updatePrivacyShow');
  expect(amapModule).toContain('AMapSearchAPI.updatePrivacyAgree');
  expect(amapModule).toContain('guard privacyReady, let apiKey');
  expect(amapModule).toContain('AMapServices.shared().apiKey = apiKey');
  expect(googleModule).toContain(
    'Bundle.main.object(forInfoDictionaryKey: "GMSApiKey")',
  );
  expect(googleModule).toContain('PlacesClient.provideAPIKey(apiKey)');
  expect(googleModule).toContain('GMSGeocoder');
  expect(googleModule).not.toContain('GMSServices.provideAPIKey(apiKey)');
});

test('exposes both completed provider search paths and no persistence', () => {
  const amapTypescript = read(
    'modules/expo-amap-search/src/ExpoAmapSearchModule.ts',
  );
  const googleTypescript = read(
    'modules/expo-google-places/src/ExpoGooglePlacesModule.ts',
  );

  expect(amapTypescript).toMatch(/\bsearchAmapPlaces\s*\(/);
  expect(googleTypescript).toMatch(/\bsearchGooglePlaces\s*\(/);
  expect(amapTypescript).not.toMatch(/repository|sqlite/i);
  expect(googleTypescript).not.toMatch(/repository|sqlite/i);
});
