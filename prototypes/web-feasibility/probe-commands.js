import { createTrip } from '@/application/trip/create-trip';
import { addItem } from '@/application/item/add-item';
import { updateItemDetails } from '@/application/item/update-item-details';
import { reorderItem } from '@/application/item/reorder-item';
import { confirmPlaceSearchResult } from '@/application/place/confirm-place-search-result';

export function commandsFor(store) {
  const createId = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const dependencies = { createId, now, runInTransaction: store.runInTransaction };
  return {
    createTrip: (input) => createTrip(input, dependencies),
    addItem: (input) => addItem(input, dependencies),
    updateItemDetails: (input) => updateItemDetails(input, { ...dependencies, createPlaceId: createId }),
    reorderItem: (input) => reorderItem(input, dependencies),
    confirmPlaceSearchResult: (input) => confirmPlaceSearchResult(input, {
      ...dependencies, createPlaceId: createId, createItemId: createId,
    }),
  };
}

export const PUBLIC_FIXTURES = {
  china_mainland: [
    { name: '示例历史文化街区 · 离线样例', address: '示例市 · 测试坐标，不是搜索结果', provider: 'amap', providerPlaceId: null, coordinate: { latitude: 35.784, longitude: 112.633, system: 'gcj02' }, regionLabel: '中国大陆', metadata: { prototypeFixture: true } },
    { name: '示例站 · 离线样例', address: '示例市 · 测试坐标，不是搜索结果', provider: 'amap', providerPlaceId: null, coordinate: { latitude: 35.762, longitude: 112.637, system: 'gcj02' }, regionLabel: '中国大陆', metadata: { prototypeFixture: true } },
  ],
  global: [
    { name: '示例庭园 · 离线样例', address: '东京 · 测试坐标，不是搜索结果', provider: 'google', providerPlaceId: null, coordinate: { latitude: 35.685, longitude: 139.71, system: 'wgs84' }, regionLabel: '日本', metadata: { prototypeFixture: true } },
    { name: '品川站 · 离线样例', address: '东京 · 测试坐标，不是搜索结果', provider: 'google', providerPlaceId: null, coordinate: { latitude: 35.629, longitude: 139.739, system: 'wgs84' }, regionLabel: '日本', metadata: { prototypeFixture: true } },
  ],
};

export async function seedTwoTrips(store) {
  const commands = commandsFor(store);
  for (const [region, title] of [['china_mainland', '国内验证'], ['global', '海外验证']]) {
    const { data: trip } = await commands.createTrip({ title, mapRegion: region, startDate: '2026-10-12', endDate: '2026-10-13' });
    const { state } = await store.read();
    const day = state.days.find((x) => x.tripId === trip.id && x.dayIndex === 1);
    for (const result of PUBLIC_FIXTURES[region]) {
      await commands.confirmPlaceSearchResult({ tripId: trip.id, dayId: day.id, result, itemType: 'sightseeing' });
    }
  }
  return store.read();
}

