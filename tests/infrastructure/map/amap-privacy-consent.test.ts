import { beforeEach, expect, jest, test } from '@jest/globals';

import {
  AMAP_PRIVACY_CONSENT_STORAGE_KEY,
  AMAP_PRIVACY_POLICY_VERSION,
  hasAcceptedAmapPrivacyConsent,
  persistAmapPrivacyConsent,
} from '../../../src/infrastructure/map/amap-privacy-consent';

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  const getItem = jest.fn(async (key: string) => values.get(key) ?? null);
  const setItem = jest.fn(async (key: string, value: string) => {
    values.set(key, value);
  });

  return {
    __esModule: true,
    default: { getItem, setItem },
    __mock: { getItem, setItem, values },
  };
});

const storage = jest.requireMock('@react-native-async-storage/async-storage') as {
  __mock: {
    getItem: ReturnType<typeof jest.fn<(key: string) => Promise<string | null>>>;
    setItem: ReturnType<typeof jest.fn<(key: string, value: string) => Promise<void>>>;
    values: Map<string, string>;
  };
};

beforeEach(() => {
  storage.__mock.values.clear();
  storage.__mock.getItem.mockClear();
  storage.__mock.setItem.mockClear();
});

test('persists accepted consent in one global record with policy version and timestamp', async () => {
  await persistAmapPrivacyConsent(true);

  expect(storage.__mock.setItem).toHaveBeenCalledWith(
    AMAP_PRIVACY_CONSENT_STORAGE_KEY,
    expect.any(String),
  );
  const record = JSON.parse(
    storage.__mock.values.get(AMAP_PRIVACY_CONSENT_STORAGE_KEY) ?? 'null',
  ) as { agreed: boolean; policyVersion: string; agreedAt: string };
  expect(record).toEqual({
    agreed: true,
    policyVersion: AMAP_PRIVACY_POLICY_VERSION,
    agreedAt: expect.any(String),
  });
  expect(Number.isNaN(Date.parse(record.agreedAt))).toBe(false);
  await expect(hasAcceptedAmapPrivacyConsent()).resolves.toBe(true);
  expect(storage.__mock.getItem).toHaveBeenCalledWith(AMAP_PRIVACY_CONSENT_STORAGE_KEY);
});

test('persists refusal as agreed=false without an acceptance timestamp', async () => {
  await persistAmapPrivacyConsent(false);

  expect(JSON.parse(
    storage.__mock.values.get(AMAP_PRIVACY_CONSENT_STORAGE_KEY) ?? 'null',
  )).toEqual({
    agreed: false,
    policyVersion: AMAP_PRIVACY_POLICY_VERSION,
    agreedAt: null,
  });
  await expect(hasAcceptedAmapPrivacyConsent()).resolves.toBe(false);
});

test('treats another policy version, malformed JSON, and missing timestamps as unaccepted', async () => {
  const staleRecord = JSON.stringify({
    agreed: true,
    policyVersion: 'previous-version',
    agreedAt: new Date().toISOString(),
  });
  storage.__mock.values.set(AMAP_PRIVACY_CONSENT_STORAGE_KEY, staleRecord);
  await expect(hasAcceptedAmapPrivacyConsent()).resolves.toBe(false);

  storage.__mock.values.set(AMAP_PRIVACY_CONSENT_STORAGE_KEY, '{');
  await expect(hasAcceptedAmapPrivacyConsent()).resolves.toBe(false);

  storage.__mock.values.set(AMAP_PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify({
    agreed: true,
    policyVersion: AMAP_PRIVACY_POLICY_VERSION,
  }));
  await expect(hasAcceptedAmapPrivacyConsent()).resolves.toBe(false);
});

test('surfaces storage read and write failures to the fail-closed gate', async () => {
  storage.__mock.getItem.mockRejectedValueOnce(new Error('read failed'));
  await expect(hasAcceptedAmapPrivacyConsent()).rejects.toThrow('read failed');

  storage.__mock.setItem.mockRejectedValueOnce(new Error('write failed'));
  await expect(persistAmapPrivacyConsent(true)).rejects.toThrow('write failed');
});
