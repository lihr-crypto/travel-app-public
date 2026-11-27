import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';

import type { BindApplePlaceCommand } from '@/application/place/bind-apple-place';
import type { Place } from '@/domain/place/types';
import { convertAmapCoordinatesToWgs84 } from '../../modules/expo-amap-search/src/ExpoAmapSearchModule';
import { PlaceProviderError, type PlaceSearchResult } from '@/infrastructure/place/place-provider';
import { ApplePlaceProvider } from '@/infrastructure/place/apple-place-provider';
import { useApplePlaceResolution } from '@/state/apple-place-resolution';

jest.mock('../../modules/expo-amap-search/src/ExpoAmapSearchModule', () => ({ convertAmapCoordinatesToWgs84: jest.fn() }));
jest.mock('@/infrastructure/database', () => ({
  applePlaceBindingSource: { getBindings: jest.fn() },
}));
jest.mock('@/infrastructure/database/apple-place-command', () => ({
  bindApplePlaceCommand: jest.fn(),
}));

type Bindings = Record<string, Place>;
type HarnessSnapshot = ReturnType<typeof useApplePlaceResolution>;

const bindingSource = jest.requireMock('@/infrastructure/database') as {
  applePlaceBindingSource: {
    getBindings: jest.Mock<(sourcePlaceIds: readonly string[]) => Promise<Bindings>>;
  };
};
const bindCommand = jest.requireMock('@/infrastructure/database/apple-place-command') as {
  bindApplePlaceCommand: jest.Mock<BindApplePlaceCommand>;
};
const appleSearch = jest.spyOn(ApplePlaceProvider.prototype, 'search');
let bindings: Bindings;
let sourcePlaces: Record<string, Place>;

const timestamp = '2026-10-08T00:00:00.000Z';

function savedPlace(overrides: Partial<Place> & Pick<Place, 'id' | 'name'>): Place {
  return {
    id: overrides.id,
    name: overrides.name,
    coordinate: overrides.coordinate ?? {
      latitude: 35.6812,
      longitude: 139.7671,
      system: 'wgs84',
    },
    address: overrides.address ?? 'Tokyo',
    provider: overrides.provider === undefined ? 'google' : overrides.provider,
    providerPlaceId: overrides.providerPlaceId ?? `provider-${overrides.id}`,
    metadata: overrides.metadata ?? { imported: true },
    createdAt: overrides.createdAt ?? timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
  };
}

function sourceFixture(id: string, name: string): Place {
  return savedPlace({
    id,
    name,
    coordinate: { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' },
    address: `Original ${id} address`,
    provider: null,
    providerPlaceId: `legacy-${id}`,
    metadata: { imported: true, source: id },
  });
}

function resultFor(
  source: Place,
  suffix = source.id,
  latitude = source.coordinate.latitude + 0.0001,
): PlaceSearchResult {
  return {
    name: source.name,
    address: `Apple ${source.name} address`,
    coordinate: {
      latitude,
      longitude: source.coordinate.longitude + 0.0001,
      system: 'wgs84',
    },
    provider: 'apple',
    providerPlaceId: `apple-${suffix}`,
    regionLabel: 'Tokyo',
    metadata: { source: 'apple' },
  };
}

function savedApplePlace(sourcePlaceId: string, result: PlaceSearchResult): Place {
  const source = sourcePlaces[sourcePlaceId];
  return {
    id: `apple-${sourcePlaceId}`,
    name: result.name,
    coordinate: result.coordinate,
    address: result.address,
    provider: 'apple',
    providerPlaceId: result.providerPlaceId,
    metadata: result.metadata,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function Harness({
  rawPlaces,
  autoResolve,
  onSnapshot,
}: {
  rawPlaces: Readonly<Record<string, Place>>;
  autoResolve: boolean;
  onSnapshot: (snapshot: HarnessSnapshot) => void;
}) {
  onSnapshot(useApplePlaceResolution(rawPlaces, autoResolve));
  return null;
}

async function flushReact() {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
    await jest.advanceTimersByTimeAsync(100);
  });
}

async function waitUntil(predicate: () => boolean, message: string) {
  for (let index = 0; index < 40; index += 1) {
    if (predicate()) return;
    await flushReact();
  }
  throw new Error(`Timed out waiting for ${message}.`);
}

async function mount(
  rawPlaces: Readonly<Record<string, Place>>,
  autoResolve = true,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  let latest!: HarnessSnapshot;
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <Harness
          autoResolve={autoResolve}
          onSnapshot={(snapshot) => { latest = snapshot; }}
          rawPlaces={rawPlaces}
        />
      </QueryClientProvider>,
    );
  });
  return {
    queryClient,
    renderer,
    get current() { return latest; },
    dispose() {
      act(() => renderer.unmount());
      queryClient.clear();
    },
  };
}

afterEach(() => { jest.useRealTimers(); });

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(convertAmapCoordinatesToWgs84).mockReset();
  bindings = {};
  sourcePlaces = {};
  bindingSource.applePlaceBindingSource.getBindings
    .mockReset()
    .mockImplementation(async (sourcePlaceIds) => Object.fromEntries(
      sourcePlaceIds.flatMap((id) => bindings[id] ? [[id, bindings[id]]] : []),
    ));
  bindCommand.bindApplePlaceCommand
    .mockReset()
    .mockImplementation(async ({ sourcePlaceId, result }) => {
      const place = savedApplePlace(sourcePlaceId, result);
      bindings[sourcePlaceId] = place;
      return {
        data: place,
        affectedEntityIds: [sourcePlaceId, place.id],
        validationIssues: [],
      };
    });
  appleSearch.mockReset().mockResolvedValue({
    results: [],
    nextCursor: null,
    suggestions: [],
  });
});

test('loads existing Apple bindings and Apple-native Places without starting a search', async () => {
  const legacy = sourceFixture('legacy-bound', 'Tokyo Station');
  const mapped = savedPlace({
    id: 'apple-station',
    name: 'Tokyo Station',
    provider: 'apple',
    providerPlaceId: 'maps-id',
    coordinate: { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' },
  });
  const newApple = savedPlace({
    id: 'apple-new',
    name: 'Shibuya Scramble',
    provider: 'apple',
    providerPlaceId: 'maps-shibuya',
    coordinate: { latitude: 35.6595, longitude: 139.7005, system: 'wgs84' },
  });
  sourcePlaces[legacy.id] = legacy;
  bindings[legacy.id] = mapped;
  const rawPlaces = Object.freeze({ [legacy.id]: legacy, [newApple.id]: newApple });
  const harness = await mount(rawPlaces);

  await waitUntil(() => harness.current.mapPlacesById[legacy.id]?.id === mapped.id, 'binding query result');
  expect(bindingSource.applePlaceBindingSource.getBindings).toHaveBeenCalledWith([legacy.id]);
  expect(harness.current.unresolved).toEqual([]);
  expect(harness.current.mapPlacesById[legacy.id]).toMatchObject({ ...mapped, displayName: legacy.name });
  expect(mapped).not.toHaveProperty('displayName');
  expect(harness.current.mapPlacesById[newApple.id]).toBe(newApple);
  expect(appleSearch).not.toHaveBeenCalled();

  harness.dispose();
});

test('automatically matches old Places sequentially across command invalidations without changing originals', async () => {
  const first = sourceFixture('legacy-first', 'Tokyo Station');
  const second = sourceFixture('legacy-second', 'Kyoto Station');
  sourcePlaces = { [first.id]: first, [second.id]: second };
  const rawPlaces = Object.freeze({ [first.id]: first, [second.id]: second });
  const originalSnapshot = JSON.stringify(rawPlaces);
  appleSearch.mockImplementation(async ({ keyword }) => {
    const source = Object.values(sourcePlaces).find(({ name }) => name === keyword);
    return {
      results: source ? [resultFor(source)] : [],
      nextCursor: null,
      suggestions: [],
    };
  });
  const harness = await mount(rawPlaces);

  await waitUntil(
    () => appleSearch.mock.calls.length === 2 && harness.current.unresolved.length === 0,
    'both automatic Apple matches and their invalidation reads',
  );

  expect(appleSearch.mock.calls.map(([query]) => query.keyword))
    .toEqual(['Tokyo Station', 'Kyoto Station']);
  expect(appleSearch.mock.calls.map(([query]) => query.limit)).toEqual([20, 20]);
  expect(bindCommand.bindApplePlaceCommand.mock.calls.map(([input]) => input.sourcePlaceId))
    .toEqual([first.id, second.id]);
  expect(bindingSource.applePlaceBindingSource.getBindings.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(harness.current.mapPlacesById[first.id].provider).toBe('apple');
  expect(harness.current.mapPlacesById[second.id].provider).toBe('apple');
  expect(harness.current.unresolved).toEqual([]);
  expect(JSON.stringify(rawPlaces)).toBe(originalSnapshot);
  expect(rawPlaces[first.id]).toBe(first);
  expect(rawPlaces[second.id]).toBe(second);

  harness.dispose();
});

test.each(['ambiguous', 'failed'] as const)(
  'keeps %s automatic matches unresolved until an explicit confirmation succeeds',
  async (outcome) => {
    const legacy = sourceFixture(`legacy-${outcome}`, 'Tokyo Station');
    sourcePlaces = { [legacy.id]: legacy };
    const rawPlaces = Object.freeze({ [legacy.id]: legacy });
    const manualChoice = resultFor(legacy, 'manual-choice', legacy.coordinate.latitude + 0.0005);

    if (outcome === 'ambiguous') {
      appleSearch.mockResolvedValue({
        results: [
          resultFor(legacy, 'candidate-a', legacy.coordinate.latitude + 0.0005),
          resultFor(legacy, 'candidate-b', legacy.coordinate.latitude + 0.001),
        ],
        nextCursor: null,
        suggestions: [],
      });
    } else {
      appleSearch.mockRejectedValue(new Error('Apple search unavailable'));
    }

    const harness = await mount(rawPlaces);
    await waitUntil(
      () => appleSearch.mock.calls.length === 1 && !harness.current.resolving,
      'the unsuccessful automatic attempt to finish',
    );
    expect(harness.current.unresolved.map(({ id }) => id)).toEqual([legacy.id]);
    expect(bindCommand.bindApplePlaceCommand).not.toHaveBeenCalled();
    expect(rawPlaces[legacy.id]).toBe(legacy);

    await act(async () => {
      await harness.current.confirm(legacy.id, manualChoice);
    });
    await waitUntil(() => harness.current.unresolved.length === 0, 'manual binding invalidation');

    expect(bindCommand.bindApplePlaceCommand).toHaveBeenCalledWith({
      sourcePlaceId: legacy.id,
      result: manualChoice,
    });
    expect(harness.current.mapPlacesById[legacy.id].provider).toBe('apple');
    expect(harness.current.unresolved).toEqual([]);
    expect(rawPlaces[legacy.id]).toBe(legacy);

    harness.dispose();
  },
);

test('autoResolve=false still loads bindings but never searches from the Home path', async () => {
  const legacy = sourceFixture('legacy-home', 'Tokyo Station');
  sourcePlaces = { [legacy.id]: legacy };
  const rawPlaces = Object.freeze({ [legacy.id]: legacy });
  const harness = await mount(rawPlaces, false);

  await waitUntil(
    () => bindingSource.applePlaceBindingSource.getBindings.mock.calls.length > 0,
    'the binding query to load',
  );
  await flushReact();
  expect(harness.current.unresolved).toEqual([legacy]);
  expect(appleSearch).not.toHaveBeenCalled();
  expect(bindCommand.bindApplePlaceCommand).not.toHaveBeenCalled();

  harness.dispose();
});


test('paces automatic searches and pauses them when the confirmation panel opens', async () => {
  const first = sourceFixture('paced-first', 'Tokyo Station');
  const second = sourceFixture('paced-second', 'Kyoto Station');
  sourcePlaces = { [first.id]: first, [second.id]: second };
  const harness = await mount(sourcePlaces);
  await flushReact();
  expect(appleSearch).toHaveBeenCalledTimes(1);
  await act(async () => { harness.current.setManualVisible(true); });
  await act(async () => { await jest.advanceTimersByTimeAsync(5_000); });
  expect(appleSearch).toHaveBeenCalledTimes(1);
  await act(async () => { harness.current.setManualVisible(false); });
  await flushReact();
  expect(appleSearch).toHaveBeenCalledTimes(2);
  expect(appleSearch.mock.calls[1][0].keyword).toBe(second.name);
  harness.dispose();
});

test('a throttle pauses the batch then retries the same Place without consuming it', async () => {
  const legacy = sourceFixture('throttled-place', 'Tokyo Station');
  sourcePlaces = { [legacy.id]: legacy };
  appleSearch.mockRejectedValueOnce(new PlaceProviderError('apple', 'rate_limited', 'throttled'));
  appleSearch.mockResolvedValue({ results: [resultFor(legacy)], nextCursor: null, suggestions: [] });
  const harness = await mount(sourcePlaces);
  await flushReact();
  expect(appleSearch).toHaveBeenCalledTimes(1);
  expect(harness.current.unresolved).toEqual([legacy]);
  await act(async () => { await jest.advanceTimersByTimeAsync(59_000); });
  expect(appleSearch).toHaveBeenCalledTimes(1);
  await act(async () => { await jest.advanceTimersByTimeAsync(1_100); });
  await waitUntil(() => harness.current.unresolved.length === 0, 'retry binding');
  expect(appleSearch).toHaveBeenCalledTimes(2);
  expect(bindCommand.bindApplePlaceCommand).toHaveBeenCalledTimes(1);
  harness.dispose();
});

test('does not send the next automatic lookup immediately after an empty answer', async () => {
  const first = sourceFixture('first-empty', 'Tokyo Station');
  const second = sourceFixture('second-empty', 'Kyoto Station');
  sourcePlaces = { [first.id]: first, [second.id]: second };
  const harness = await mount(sourcePlaces);
  await flushReact();
  expect(appleSearch).toHaveBeenCalledTimes(1);
  await act(async () => { await jest.advanceTimersByTimeAsync(1_500); });
  expect(appleSearch).toHaveBeenCalledTimes(1);
  await act(async () => { await jest.advanceTimersByTimeAsync(1_000); });
  expect(appleSearch).toHaveBeenCalledTimes(2);
  harness.dispose();
});


test('old AMap Places draw from local display coordinates using original names without Apple searches', async () => {
  const legacy: Place = { ...sourceFixture('sample-street', '示例历史文化街区'), provider: 'amap',
    coordinate: { latitude: 35.781791, longitude: 112.640729, system: 'gcj02' } };
  sourcePlaces = { [legacy.id]: legacy };
  const original = JSON.stringify(legacy);
  const display = { latitude: 35.780, longitude: 112.634, system: 'wgs84' as const };
  jest.mocked(convertAmapCoordinatesToWgs84).mockResolvedValue([display]);
  const harness = await mount(sourcePlaces);
  await waitUntil(() => !!harness.current.mapPlacesById[legacy.id], 'AMap display projection');
  expect(convertAmapCoordinatesToWgs84).toHaveBeenCalledWith([legacy.coordinate]);
  expect(harness.current.mapPlacesById[legacy.id]).toMatchObject({ name: legacy.name, provider: 'amap',
    coordinate: legacy.coordinate, displayCoordinate: display });
  expect(harness.current.unresolved).toEqual([]);
  expect(appleSearch).not.toHaveBeenCalled();
  expect(bindCommand.bindApplePlaceCommand).not.toHaveBeenCalled();
  expect(JSON.stringify(legacy)).toBe(original);
  harness.dispose();
});

test('legacy names remain map labels when an existing Apple binding has a different SDK name', async () => {
  const legacy = sourceFixture('foreign-source', '原来保存的名称');
  sourcePlaces = { [legacy.id]: legacy };
  const apple = savedPlace({ id: 'apple-bound', name: 'Apple Address', provider: 'apple' });
  bindings[legacy.id] = apple;
  const harness = await mount(sourcePlaces, false);
  await waitUntil(() => !!harness.current.mapPlacesById[legacy.id], 'saved Apple binding');
  expect(harness.current.mapPlacesById[legacy.id]).toMatchObject({ name: 'Apple Address', displayName: legacy.name });
  expect(apple).not.toHaveProperty('displayName');
  harness.dispose();
});


test('saved Japanese Google points retain their original names and WGS84 coordinates without Apple lookup or bindings', async () => {
  const names = ['示例庭园', 'Shinagawa Sta.', '示例寺', '示例区'];
  sourcePlaces = Object.fromEntries(names.map((name, index) => {
    const place: Place = { ...sourceFixture(`google-${index}`, name), provider: 'google',
      coordinate: { latitude: 35.68 + index * 0.001, longitude: 139.70, system: 'wgs84' } };
    return [place.id, place];
  }));
  const original = JSON.stringify(sourcePlaces);
  const conflicting = savedPlace({ id: 'wrong-apple-building', name: '示例庭园ビル', provider: 'apple' });
  bindings['google-0'] = conflicting;
  const harness = await mount(sourcePlaces);
  await flushReact();
  expect(harness.current.unresolved).toEqual([]);
  for (const place of Object.values(sourcePlaces)) {
    expect(harness.current.mapPlacesById[place.id]).toBe(place);
    expect(harness.current.mapPlacesById[place.id].name).toBe(place.name);
    expect(harness.current.mapPlacesById[place.id].coordinate).toBe(place.coordinate);
  }
  expect(bindingSource.applePlaceBindingSource.getBindings).toHaveBeenCalledWith([]);
  expect(appleSearch).not.toHaveBeenCalled();
  expect(bindCommand.bindApplePlaceCommand).not.toHaveBeenCalled();
  expect(convertAmapCoordinatesToWgs84).not.toHaveBeenCalled();
  expect(JSON.stringify(sourcePlaces)).toBe(original);
  expect(conflicting.name).toBe('示例庭园ビル');
  harness.dispose();
});
