import { beforeEach, expect, jest, test } from '@jest/globals';

import { setAmapPrivacyStatus } from '../../../modules/expo-amap-map/src/ExpoAmapMapModule';
import { setAmapSearchPrivacyStatus } from '../../../modules/expo-amap-search/src/ExpoAmapSearchModule';

jest.mock('expo', () => {
  const mapPrivacyStatus = jest.fn(async () => false);
  const searchPrivacyStatus = jest.fn(async () => true);
  return {
    requireNativeModule: jest.fn((name: string) => ({
      setPrivacyStatusAsync: name === 'ExpoAmapMap' ? mapPrivacyStatus : searchPrivacyStatus,
    })),
    __mock: { mapPrivacyStatus, searchPrivacyStatus },
  };
});

const native = jest.requireMock('expo') as {
  __mock: {
    mapPrivacyStatus: ReturnType<typeof jest.fn>;
    searchPrivacyStatus: ReturnType<typeof jest.fn>;
  };
};

beforeEach(() => {
  native.__mock.mapPrivacyStatus.mockClear();
  native.__mock.searchPrivacyStatus.mockClear();
});

test('passes only the explicit map privacy choice to the map native module', async () => {
  await expect(setAmapPrivacyStatus({
    shown: true,
    includesAmap: true,
    agreed: false,
  })).resolves.toBe(false);
  expect(native.__mock.mapPrivacyStatus).toHaveBeenCalledWith(true, true, false);
  expect(native.__mock.searchPrivacyStatus).not.toHaveBeenCalled();
});

test('passes only the explicit search privacy choice to the search native module', async () => {
  await expect(setAmapSearchPrivacyStatus({
    shown: true,
    includesAmap: true,
    agreed: true,
  })).resolves.toBe(true);
  expect(native.__mock.searchPrivacyStatus).toHaveBeenCalledWith(true, true, true);
  expect(native.__mock.mapPrivacyStatus).not.toHaveBeenCalled();
});
