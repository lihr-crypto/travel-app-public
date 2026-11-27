import { beforeEach, expect, jest, test } from '@jest/globals';
import { useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';

import { AmapPrivacyGate } from '@/components/amap-privacy-gate';
import {
  AMAP_PRIVACY_CONSENT_STORAGE_KEY,
  AMAP_PRIVACY_POLICY_VERSION,
} from '@/infrastructure/map/amap-privacy-consent';
import { SafeAreaTestProvider } from '../helpers/safe-area';

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

jest.mock('../../modules/expo-amap-map/src/ExpoAmapMapModule', () => ({
  setAmapPrivacyStatus: jest.fn(async () => true),
}));
jest.mock('../../modules/expo-amap-search/src/ExpoAmapSearchModule', () => ({
  setAmapSearchPrivacyStatus: jest.fn(async () => true),
}));

interface PrivacyStatusInput {
  shown: boolean;
  includesAmap: boolean;
  agreed: boolean;
}

const storage = jest.requireMock('@react-native-async-storage/async-storage') as {
  __mock: {
    getItem: ReturnType<typeof jest.fn<(key: string) => Promise<string | null>>>;
    setItem: ReturnType<typeof jest.fn<(key: string, value: string) => Promise<void>>>;
    values: Map<string, string>;
  };
};
const native = jest.requireMock('../../modules/expo-amap-map/src/ExpoAmapMapModule') as {
  setAmapPrivacyStatus: ReturnType<typeof jest.fn<(input: PrivacyStatusInput) => Promise<boolean>>>;
};
const nativeSearch = jest.requireMock(
  '../../modules/expo-amap-search/src/ExpoAmapSearchModule',
) as {
  setAmapSearchPrivacyStatus: ReturnType<typeof jest.fn<(input: PrivacyStatusInput) => Promise<boolean>>>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function MapChild({
  onMount,
  onUnmount,
}: {
  onMount?: () => void;
  onUnmount?: () => void;
}) {
  useEffect(() => {
    onMount?.();
    return () => onUnmount?.();
  }, [onMount, onUnmount]);
  return <Text>地图已就绪</Text>;
}

function mountGate(
  tripId = 'trip-a',
  lifecycle?: { onMount?: () => void; onUnmount?: () => void },
) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaTestProvider>
        <AmapPrivacyGate key={tripId}>
          <MapChild onMount={lifecycle?.onMount} onUnmount={lifecycle?.onUnmount} />
        </AmapPrivacyGate>
      </SafeAreaTestProvider>,
    );
  });
  return renderer;
}

test('optional mainland search consent can be declined while overseas search remains available', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(
    <SafeAreaTestProvider>
      <AmapPrivacyGate allowWithoutAmap><Text testID="overseas-search">海外地点搜索</Text></AmapPrivacyGate>
    </SafeAreaTestProvider>,
  ); });
  await flush();
  expect(renderer.root.findAllByProps({ testID: 'overseas-search' })).toHaveLength(0);
  await press(renderer, 'amap-privacy-decline');
  await flush();
  expect(renderer.root.findByProps({ testID: 'overseas-search' })).toBeDefined();
  expect(nativeSearch.setAmapSearchPrivacyStatus).not.toHaveBeenCalledWith(expect.objectContaining({ agreed: true }));
  expect(nativeSearch.setAmapSearchPrivacyStatus).toHaveBeenCalledWith(expect.objectContaining({ agreed: false }));
  act(() => renderer.unmount());
});

async function flush() {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
  });
}

async function renderGate(
  tripId = 'trip-a',
  lifecycle?: { onMount?: () => void; onUnmount?: () => void },
) {
  const renderer = mountGate(tripId, lifecycle);
  await flush();
  return renderer;
}

async function press(renderer: ReturnType<typeof create>, testID: string) {
  act(() => {
    renderer.root.findByProps({ testID }).props.onPress();
  });
  await flush();
}

function seedAcceptedConsent() {
  storage.__mock.values.set(AMAP_PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify({
    agreed: true,
    policyVersion: AMAP_PRIVACY_POLICY_VERSION,
    agreedAt: new Date().toISOString(),
  }));
}

beforeEach(() => {
  storage.__mock.values.clear();
  storage.__mock.getItem.mockReset().mockImplementation(async (key) => (
    storage.__mock.values.get(key) ?? null
  ));
  storage.__mock.setItem.mockReset().mockImplementation(async (key, value) => {
    storage.__mock.values.set(key, value);
  });
  native.setAmapPrivacyStatus.mockReset().mockResolvedValue(true);
  nativeSearch.setAmapSearchPrivacyStatus.mockReset().mockResolvedValue(true);
});

test('fresh use shows the policy before native setup and mounts only after both calls and persistence', async () => {
  const events: string[] = [];
  const mapStatus = deferred<boolean>();
  const searchStatus = deferred<boolean>();
  const renderer = await renderGate('trip-a', { onMount: () => events.push('child-mounted') });

  expect(renderer.root.findByProps({ testID: 'amap-privacy-policy' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'amap-privacy-agree' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).not.toContain('地图已就绪');
  expect(native.setAmapPrivacyStatus).not.toHaveBeenCalled();
  expect(nativeSearch.setAmapSearchPrivacyStatus).not.toHaveBeenCalled();

  native.setAmapPrivacyStatus.mockImplementation(async (input) => {
    events.push(`map:${input.agreed}`);
    return mapStatus.promise;
  });
  nativeSearch.setAmapSearchPrivacyStatus.mockImplementation(async (input) => {
    events.push(`search:${input.agreed}`);
    return searchStatus.promise;
  });
  storage.__mock.setItem.mockImplementation(async (key, value) => {
    events.push('persist');
    storage.__mock.values.set(key, value);
  });

  act(() => {
    renderer.root.findByProps({ testID: 'amap-privacy-agree' }).props.onPress();
  });
  await flush();
  expect(events).toEqual(['map:true', 'search:true']);
  expect(storage.__mock.setItem).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).not.toContain('地图已就绪');

  await act(async () => {
    mapStatus.resolve(true);
    await Promise.resolve();
  });
  expect(storage.__mock.setItem).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).not.toContain('地图已就绪');

  await act(async () => {
    searchStatus.resolve(true);
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
  });
  expect(events).toEqual(['map:true', 'search:true', 'persist', 'child-mounted']);
  expect(JSON.stringify(renderer.toJSON())).toContain('地图已就绪');
  // The ready surface exposes no consent-revocation control.
  expect(renderer.root.findAllByProps({ testID: 'amap-privacy-revoke' })).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).not.toContain('撤销地图同意');
  act(() => renderer.unmount());
});

test('acceptance is global across distinct Trip wrappers and remount re-reads then re-applies both native statuses', async () => {
  const first = await renderGate('trip-a');
  await press(first, 'amap-privacy-agree');
  expect(JSON.parse(
    storage.__mock.values.get(AMAP_PRIVACY_CONSENT_STORAGE_KEY) ?? 'null',
  )).toMatchObject({ agreed: true, policyVersion: AMAP_PRIVACY_POLICY_VERSION });
  act(() => first.unmount());

  native.setAmapPrivacyStatus.mockClear();
  nativeSearch.setAmapSearchPrivacyStatus.mockClear();
  const mapStatus = deferred<boolean>();
  const searchStatus = deferred<boolean>();
  native.setAmapPrivacyStatus.mockReturnValue(mapStatus.promise);
  nativeSearch.setAmapSearchPrivacyStatus.mockReturnValue(searchStatus.promise);

  const second = mountGate('trip-b');
  await flush();
  expect(storage.__mock.getItem).toHaveBeenCalledTimes(2);
  expect(storage.__mock.getItem).toHaveBeenLastCalledWith(AMAP_PRIVACY_CONSENT_STORAGE_KEY);
  expect(native.setAmapPrivacyStatus).toHaveBeenCalledWith({
    shown: true, includesAmap: true, agreed: true,
  });
  expect(nativeSearch.setAmapSearchPrivacyStatus).toHaveBeenCalledWith({
    shown: true, includesAmap: true, agreed: true,
  });
  expect(JSON.stringify(second.toJSON())).not.toContain('地图已就绪');
  expect(second.root.findAllByProps({ testID: 'amap-privacy-agree' })).toHaveLength(0);

  await act(async () => {
    mapStatus.resolve(true);
    await Promise.resolve();
  });
  expect(JSON.stringify(second.toJSON())).not.toContain('地图已就绪');
  await act(async () => {
    searchStatus.resolve(true);
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
  });
  expect(JSON.stringify(second.toJSON())).toContain('地图已就绪');
  expect(second.root.findAllByProps({ testID: 'amap-privacy-agree' })).toHaveLength(0);
  act(() => second.unmount());
});

test('a policy version mismatch requires confirmation and does not initialize native APIs', async () => {
  storage.__mock.values.set(AMAP_PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify({
    agreed: true,
    policyVersion: 'previous-version',
    agreedAt: new Date().toISOString(),
  }));

  const renderer = await renderGate('trip-c');
  expect(renderer.root.findByProps({ testID: 'amap-privacy-policy' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'amap-privacy-agree' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).not.toContain('地图已就绪');
  expect(native.setAmapPrivacyStatus).not.toHaveBeenCalled();
  expect(nativeSearch.setAmapSearchPrivacyStatus).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('decline calls both native APIs, persists no acceptance, and a later Trip remount prompts again', async () => {
  const first = await renderGate('trip-a');
  await press(first, 'amap-privacy-decline');

  const expectedStatus = { shown: true, includesAmap: true, agreed: false };
  expect(native.setAmapPrivacyStatus).toHaveBeenCalledWith(expectedStatus);
  expect(nativeSearch.setAmapSearchPrivacyStatus).toHaveBeenCalledWith(expectedStatus);
  expect(JSON.parse(
    storage.__mock.values.get(AMAP_PRIVACY_CONSENT_STORAGE_KEY) ?? 'null',
  )).toEqual({
    agreed: false,
    policyVersion: AMAP_PRIVACY_POLICY_VERSION,
    agreedAt: null,
  });
  expect(JSON.stringify(first.toJSON())).not.toContain('地图已就绪');
  act(() => first.unmount());

  native.setAmapPrivacyStatus.mockClear();
  nativeSearch.setAmapSearchPrivacyStatus.mockClear();
  const second = await renderGate('trip-b');
  expect(second.root.findByProps({ testID: 'amap-privacy-agree' })).toBeDefined();
  expect(JSON.stringify(second.toJSON())).not.toContain('地图已就绪');
  expect(native.setAmapPrivacyStatus).not.toHaveBeenCalled();
  expect(nativeSearch.setAmapSearchPrivacyStatus).not.toHaveBeenCalled();
  act(() => second.unmount());
});

test('ready state exposes no revocation control and a version change still re-prompts fail-closed', async () => {
  seedAcceptedConsent();
  const renderer = await renderGate('trip-a');
  expect(JSON.stringify(renderer.toJSON())).toContain('地图已就绪');
  expect(renderer.root.findAllByProps({ testID: 'amap-privacy-revoke' })).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).not.toContain('撤销地图同意');
  act(() => renderer.unmount());

  storage.__mock.values.set(AMAP_PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify({
    agreed: true,
    policyVersion: 'previous-version',
    agreedAt: new Date().toISOString(),
  }));
  native.setAmapPrivacyStatus.mockClear();
  nativeSearch.setAmapSearchPrivacyStatus.mockClear();

  const second = await renderGate('trip-b');
  expect(second.root.findByProps({ testID: 'amap-privacy-agree' })).toBeDefined();
  expect(JSON.stringify(second.toJSON())).not.toContain('地图已就绪');
  expect(second.root.findAllByProps({ testID: 'amap-privacy-revoke' })).toHaveLength(0);
  expect(native.setAmapPrivacyStatus).not.toHaveBeenCalled();
  expect(nativeSearch.setAmapSearchPrivacyStatus).not.toHaveBeenCalled();
  act(() => second.unmount());
});

test('native false result fails closed, does not persist acceptance, and retry can succeed', async () => {
  const renderer = await renderGate('trip-a');
  native.setAmapPrivacyStatus.mockReset().mockResolvedValueOnce(false).mockResolvedValue(true);

  await press(renderer, 'amap-privacy-agree');
  expect(JSON.stringify(renderer.toJSON())).not.toContain('地图已就绪');
  expect(renderer.root.findByProps({ testID: 'amap-privacy-retry' })).toBeDefined();
  expect(storage.__mock.setItem).not.toHaveBeenCalled();

  await press(renderer, 'amap-privacy-retry');
  expect(native.setAmapPrivacyStatus).toHaveBeenCalledTimes(2);
  expect(nativeSearch.setAmapSearchPrivacyStatus).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(renderer.toJSON())).toContain('地图已就绪');
  expect(JSON.parse(
    storage.__mock.values.get(AMAP_PRIVACY_CONSENT_STORAGE_KEY) ?? 'null',
  )).toMatchObject({ agreed: true, policyVersion: AMAP_PRIVACY_POLICY_VERSION });
  act(() => renderer.unmount());
});

test('startup native rejection waits for both calls, stays closed, and retry reapplies accepted consent', async () => {
  seedAcceptedConsent();
  const searchStatus = deferred<boolean>();
  native.setAmapPrivacyStatus.mockReset()
    .mockRejectedValueOnce(new Error('map status unavailable'))
    .mockResolvedValue(true);
  nativeSearch.setAmapSearchPrivacyStatus.mockReset()
    .mockReturnValueOnce(searchStatus.promise)
    .mockResolvedValue(true);

  const renderer = mountGate('trip-a');
  await flush();
  expect(native.setAmapPrivacyStatus).toHaveBeenCalledWith({
    shown: true, includesAmap: true, agreed: true,
  });
  expect(nativeSearch.setAmapSearchPrivacyStatus).toHaveBeenCalledWith({
    shown: true, includesAmap: true, agreed: true,
  });
  expect(renderer.root.findByProps({ testID: 'amap-privacy-loading' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).not.toContain('地图已就绪');
  expect(renderer.root.findAllByProps({ testID: 'amap-privacy-retry' })).toHaveLength(0);

  await act(async () => {
    searchStatus.resolve(true);
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
  });
  expect(renderer.root.findByProps({ testID: 'amap-privacy-retry' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'amap-privacy-agree' })).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).not.toContain('地图已就绪');

  await press(renderer, 'amap-privacy-retry');
  expect(native.setAmapPrivacyStatus).toHaveBeenCalledTimes(2);
  expect(nativeSearch.setAmapSearchPrivacyStatus).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(renderer.toJSON())).toContain('地图已就绪');
  act(() => renderer.unmount());
});
