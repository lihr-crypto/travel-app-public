import { expect, test } from '@jest/globals';

import { pendingPlaceName } from '@/application/place/place-selection';
import type { PlaceSearchResult } from '@/infrastructure/place/place-provider';

const result: PlaceSearchResult = {
  name: '西谷国家湿地公园',
  address: '示例办事处北山桥东13公里处',
  coordinate: { latitude: 40.36003, longitude: 106.4151, system: 'gcj02' },
  provider: 'amap',
  providerPlaceId: 'B000SAMP01',
  regionLabel: '西谷市',
  metadata: null,
};

test('a pending selection is named the way the commit will name it', () => {
  expect(pendingPlaceName({ kind: 'search', result })).toBe('西谷国家湿地公园');
  // A picked coordinate resolves through the same fallback `changeItemPlace`
  // uses, so the row never shows a label the saved Place would contradict.
  expect(pendingPlaceName({
    kind: 'map-picker',
    coordinate: { latitude: 40.36, longitude: 106.415, system: 'gcj02' },
    enrichment: null,
  })).toBe('40.36000, 106.41500');
  expect(pendingPlaceName({
    kind: 'map-picker',
    coordinate: { latitude: 40.36, longitude: 106.415, system: 'gcj02' },
    enrichment: {
      provider: 'amap',
      coordinate: { latitude: 40.36, longitude: 106.415, system: 'gcj02' },
      name: '湿地停车场',
      address: null,
      regionLabel: null,
      providerPlaceId: null,
      metadata: null,
    },
  })).toBe('湿地停车场');
});

test('no pending selection and a cleared one both have no name', () => {
  expect(pendingPlaceName(null)).toBeNull();
  expect(pendingPlaceName({ kind: 'none' })).toBeNull();
});
