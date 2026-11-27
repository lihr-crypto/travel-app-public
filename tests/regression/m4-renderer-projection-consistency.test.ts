import { expect, test } from '@jest/globals';

import { buildDayMapProjection } from '@/application/projections/day-map';
import { buildTimelineProjection } from '@/application/projections/timeline';
import { buildDayViewData } from '@/application/queries/day-view';
import { m4MapFixtures } from '@/infrastructure/database/m4-map-fixtures';
import { assertMapRendererInput } from '@/infrastructure/map/map-renderer';
import { resolveTripMapStack } from '@/infrastructure/map/map-provider-policy';

test.each(m4MapFixtures)(
  '$trip.mapRegion keeps Timeline and $place.coordinate.system map occurrence identities consistent',
  (fixture) => {
    const placeLess = {
      ...fixture.item,
      id: `${fixture.item.id}-place-less`,
      placeId: null,
      sortOrder: 0,
      title: 'Place-less',
    };
    const firstOccurrence = { ...fixture.item, sortOrder: 1 };
    const repeatedOccurrence = {
      ...fixture.item,
      id: `${fixture.item.id}-return`,
      sortOrder: 2,
      title: `${fixture.item.title} return`,
    };
    const data = buildDayViewData({
      trip: fixture.trip,
      day: fixture.day,
      items: [repeatedOccurrence, firstOccurrence, placeLess],
      placesById: { [fixture.place.id]: fixture.place },
    });
    const timeline = buildTimelineProjection(data);
    const map = buildDayMapProjection(data, repeatedOccurrence.id);
    const stack = resolveTripMapStack(fixture.trip);

    expect(timeline.items.map(({ id }) => id)).toEqual([
      placeLess.id,
      firstOccurrence.id,
      repeatedOccurrence.id,
    ]);
    expect(map.markers.map(({ id, ordinal, variant }) => ({ id, ordinal, variant })))
      .toEqual([
        { id: firstOccurrence.id, ordinal: 1, variant: 'normal' },
        { id: repeatedOccurrence.id, ordinal: 2, variant: 'selected' },
      ]);
    expect(map.markers.every(({ id }) => timeline.items.some((item) => item.id === id)))
      .toBe(true);
    expect(map.cameraRequest?.coordinates).toEqual([fixture.place.coordinate]);
    expect(stack.coordinateSystem).toBe(fixture.place.coordinate.system);
    expect(stack.renderer).toBe(
      fixture.trip.mapRegion === 'global' ? 'google' : 'amap',
    );
    expect(() => assertMapRendererInput({
      system: stack.coordinateSystem,
      markers: map.markers,
      cameraRequest: map.cameraRequest,
    })).not.toThrow();
    expect(() => assertMapRendererInput({
      system: stack.coordinateSystem === 'wgs84' ? 'gcj02' : 'wgs84',
      markers: map.markers,
      cameraRequest: map.cameraRequest,
    })).toThrow('does not match');
    expect(Object.keys(map).sort()).toEqual(['cameraRequest', 'dayId', 'markers']);
  },
);
