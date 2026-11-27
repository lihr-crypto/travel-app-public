import { expect, test } from '@jest/globals';

import { assertItemTimeFields } from '@/domain/item/time';

test('exact time accepts either endpoint independently', () => {
  expect(() => assertItemTimeFields({
    timeMode: 'exact',
    startDateTime: null,
    endDateTime: '2026-12-30T19:20',
    period: null,
  })).not.toThrow();

  expect(() => assertItemTimeFields({
    timeMode: 'exact',
    startDateTime: '2026-12-30T18:20',
    endDateTime: null,
    period: null,
  })).not.toThrow();
});

test('exact time still requires at least one endpoint', () => {
  expect(() => assertItemTimeFields({
    timeMode: 'exact',
    startDateTime: null,
    endDateTime: null,
    period: null,
  })).toThrow('Item timeMode exact requires startDateTime or endDateTime and no period');
});
