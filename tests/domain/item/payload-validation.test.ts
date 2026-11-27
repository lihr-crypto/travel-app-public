import { expect, test } from '@jest/globals';

import {
  normalizeItemPayload,
  assertItemPayloadMatchesType,
} from '@/domain/item/validation';

test('M9-T4: a Transport payload trims text fields and drops empties', () => {
  expect(
    normalizeItemPayload('transport', {
      kind: 'transport',
      mode: 'train',
      serviceNumber: ' K101 ',
      origin: '  北京 ',
      destination: '  ',
    }),
  ).toEqual({
    kind: 'transport',
    mode: 'train',
    serviceNumber: 'K101',
    origin: '北京',
  });
  expect(normalizeItemPayload('transport', { kind: 'transport' })).toEqual({
    kind: 'transport',
  });
  expect(normalizeItemPayload('transport', null)).toBeNull();
});

test('M9-T4: Transport payloads reject unknown fields, modes and non-strings', () => {
  expect(() =>
    normalizeItemPayload('transport', {
      kind: 'transport',
      mode: 'teleport',
    }),
  ).toThrow('Item payload does not match type: transport');
  expect(() =>
    normalizeItemPayload('transport', { kind: 'transport', seat: '12A' }),
  ).toThrow('Item payload does not match type: transport');
  expect(() =>
    normalizeItemPayload('transport', { kind: 'transport', origin: 42 }),
  ).toThrow('Item payload does not match type: transport');
});

test('M9-T1: a Hotel payload normalizes to the bare semantic marker', () => {
  expect(normalizeItemPayload('hotel', { kind: 'hotel' })).toEqual({
    kind: 'hotel',
  });
});

test('M9-T1: Hotel payloads reject unknown fields and foreign kinds', () => {
  // Check-in/out times belong to start/endDateTime, not the payload.
  expect(() =>
    normalizeItemPayload('hotel', { kind: 'hotel', checkIn: '2026-10-01' }),
  ).toThrow('Item payload does not match type: hotel');
  expect(() => normalizeItemPayload('hotel', { kind: 'transport' })).toThrow(
    'Item payload does not match type: hotel',
  );
  expect(() =>
    assertItemPayloadMatchesType('hotel', { kind: 'custom', label: 'x' }),
  ).toThrow('Item payload does not match type: hotel');
});

test('M9-T1: Hotel Items may still carry no payload at all', () => {
  expect(normalizeItemPayload('hotel', null)).toBeNull();
});
