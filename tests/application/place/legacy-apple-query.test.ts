import { expect, test } from '@jest/globals';

import type { Place } from '@/domain/place/types';
import {
  buildLegacyAppleQuery,
  legacyAppleSearchSuggestions,
} from '@/application/place/legacy-apple-query';

const timestamp = '2026-10-08T00:00:00.000Z';

function place(metadata: unknown, overrides: Partial<Place> = {}): Place {
  return {
    id: 'legacy-place',
    name: ' 示例路64号 ',
    coordinate: { latitude: 35.0, longitude: 112.6, system: 'gcj02' },
    address: '示例路64号',
    provider: 'amap',
    providerPlaceId: 'legacy-id',
    metadata: metadata as Record<string, unknown> | null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

test.each([
  [
    'uses the complete Sample district metadata as a textual hint',
    { district: '示例省示例市示例区' },
    '示例省示例市示例区',
  ],
  [
    'prefers and trims metadata.city',
    { city: '  示例市  ', district: '示例省示例市示例区', province: '示例省' },
    '示例市',
  ],
  ['recognizes a city embedded in province text', { province: '示例省示例市' }, '示例市'],
  ['recognizes Beijing', { province: '北京市' }, '北京市'],
  ['recognizes Hong Kong', { district: '香港' }, '香港'],
])('%s', (_name, metadata, expectedCity) => {
  const query = buildLegacyAppleQuery(place(metadata));

  expect(query).toEqual({
    keyword: ' 示例路64号 ',
    limit: 20,
    region: { city: expectedCity },
  });
});

test.each([
  ['no location metadata', null],
  ['empty metadata fields', { city: '  ', district: '', province: '' }],
  ['numeric and coordinate hints', { city: 23, district: '35.0,112.6', province: 112.6 }],
  ['serialized object fields', { city: '{"name":"示例市"}', district: '["香港"]' }],
  ['metadata serialized as a string', '{"city":"示例市"}'],
])('%s leaves the query unscoped', (_name, metadata) => {
  const source = place(metadata);
  const query = buildLegacyAppleQuery(source);

  expect(query).toEqual({ keyword: source.name, limit: 20 });
});

test('preserves the original keyword and never sends the legacy coordinate to Apple', () => {
  const source = place({ city: '香港' });
  const query = buildLegacyAppleQuery(source);

  expect(query.keyword).toBe(source.name);
  expect(query).not.toHaveProperty('center');
  expect(query).not.toHaveProperty('coordinate');
  expect(query.region).toEqual({ city: '香港' });
});

test.each([
  [
    'uses the Sample district and street address together',
    place({ district: '示例省示例市示例区' }, { address: '示例路64号' }),
    ['示例省示例市示例区 示例路64号'],
  ],
  [
    'uses metadata.city ahead of district text',
    place(
      { city: '示例市', district: '示例省示例市示例区' },
      { address: '示例路64号' },
    ),
    ['示例市 示例路64号'],
  ],
  ['uses a readable address when no region exists', place(null, { name: '旧地点', address: '示例路64号' }), ['示例路64号']],
  ['does not suggest the same text as the Place name', place(null, { address: '示例路64号' }), []],
  ['does not suggest a number as an address', place(null, { address: '64' }), []],
  ['does not suggest an address that is only coordinates', place(null, { address: '35.0,112.6' }), []],
  ['does not suggest labelled coordinate text', place(null, { address: 'latitude:35.0, longitude:112.6' }), []],
])('%s', (_name, source, expected) => {
  expect(legacyAppleSearchSuggestions(source)).toEqual(expected);
});

test('does not return an address suggestion that duplicates the original name after trimming', () => {
  const source = place({ city: '香港' }, {
    name: '香港 示例路64号',
    address: '示例路64号',
  });

  expect(legacyAppleSearchSuggestions(source)).toEqual([]);
});
