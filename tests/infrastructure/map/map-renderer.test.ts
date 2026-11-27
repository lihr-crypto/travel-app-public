import { expect, test } from '@jest/globals';

import type { MapMarkerModel } from '@/infrastructure/map/map-models';
import {
  assertMapRendererInput,
  type MapRenderer,
  type MapRendererProps,
} from '@/infrastructure/map/map-renderer';

const wgs84 = { latitude: -33.8683, longitude: 151.2086, system: 'wgs84' as const };
const gcj02 = { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' as const };

const marker: MapMarkerModel = {
  id: 'item-occurrence-1',
  coordinate: wgs84,
  ordinal: 1,
  label: 'Sydney marker',
  variant: 'normal',
};

test('accepts marker-only inputs and CRS-aware single/multi-coordinate cameras', () => {
  expect(() => assertMapRendererInput({
    system: 'wgs84',
    markers: [marker],
    cameraRequest: { coordinates: [wgs84] },
  })).not.toThrow();
  expect(() => assertMapRendererInput({
    system: 'gcj02',
    markers: [{ id: 'item-occurrence-2', coordinate: gcj02, variant: 'selected' }],
    cameraRequest: {
      coordinates: [gcj02, { ...gcj02, latitude: 39.91 }],
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
    },
  })).not.toThrow();
});

test('rejects mixed CRS in markers or camera requests', () => {
  expect(() => assertMapRendererInput({
    system: 'wgs84',
    markers: [{ ...marker, coordinate: gcj02 }],
  })).toThrow('Coordinate system gcj02 does not match wgs84');
  expect(() => assertMapRendererInput({
    system: 'gcj02',
    markers: [],
    cameraRequest: { coordinates: [wgs84] },
  })).toThrow('Coordinate system wgs84 does not match gcj02');
});

test('rejects duplicate marker IDs, invalid ordinals, and empty camera requests', () => {
  expect(() => assertMapRendererInput({
    system: 'wgs84',
    markers: [marker, { ...marker, variant: 'selected' }],
  })).toThrow('Invalid or duplicate marker ID');
  expect(() => assertMapRendererInput({
    system: 'wgs84',
    markers: [{ ...marker, ordinal: 0 }],
  })).toThrow('Invalid marker ordinal');
  expect(() => assertMapRendererInput({
    system: 'wgs84',
    markers: [],
    cameraRequest: { coordinates: [wgs84], requestId: 0 },
  })).toThrow('Invalid camera request ID');
  expect(() => assertMapRendererInput({
    system: 'wgs84',
    markers: [],
    cameraRequest: { coordinates: [] },
  })).toThrow('Camera request needs at least one coordinate');
  expect(() => assertMapRendererInput({
    system: 'wgs84',
    markers: [],
    cameraRequest: {
      coordinates: [wgs84],
      padding: { top: -1, right: 0, bottom: 0, left: 0 },
    },
  })).toThrow('Invalid camera padding');
});

test('the renderer seam carries only neutral primitives and event intents', () => {
  const events: unknown[] = [];
  const props: MapRendererProps = {
    system: 'wgs84',
    markers: [marker],
    onMarkerPress: (id) => events.push(id),
    onMapPress: (coordinate) => events.push(coordinate),
    onViewportChange: (viewport) => events.push(viewport),
  };
  const adapter: MapRenderer = (input) => {
    assertMapRendererInput(input);
    input.onMarkerPress?.(input.markers[0].id);
    input.onMapPress?.(wgs84);
    input.onViewportChange?.({ center: wgs84, latitudeDelta: 0.1, longitudeDelta: 0.1 });
    return null;
  };

  expect(adapter(props)).toBeNull();
  expect(events).toEqual([
    'item-occurrence-1',
    wgs84,
    { center: wgs84, latitudeDelta: 0.1, longitudeDelta: 0.1 },
  ]);
});
