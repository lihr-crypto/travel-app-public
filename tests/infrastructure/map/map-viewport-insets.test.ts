import { expect, test } from '@jest/globals';

import { buildMapViewportPadding } from '@/infrastructure/map/map-viewport-insets';

const safeArea = { top: 47, right: 0, bottom: 34, left: 0 };

test('accounts for safe area and the current sheet height in camera padding', () => {
  expect(buildMapViewportPadding({ safeArea, viewportHeight: 844, sheetSnap: 'half' }))
    .toEqual({ top: 63, right: 16, bottom: 455.12, left: 16 });
  expect(buildMapViewportPadding({ safeArea, viewportHeight: 844, sheetSnap: 'collapsed' }).bottom)
    .toBe(168.16);
  expect(buildMapViewportPadding({ safeArea, viewportHeight: 844, sheetSnap: 'expanded' }).bottom)
    .toBe(792.72);
});

test('rejects invalid viewport geometry but keeps the model presentation-only', () => {
  expect(() => buildMapViewportPadding({ safeArea, viewportHeight: -1, sheetSnap: 'half' }))
    .toThrow('Viewport height must be finite and non-negative');
  expect(() => buildMapViewportPadding({ safeArea, viewportHeight: 100, sheetSnap: 'half', edgeGutter: -1 }))
    .toThrow('Map edge gutter must be finite and non-negative');
});
