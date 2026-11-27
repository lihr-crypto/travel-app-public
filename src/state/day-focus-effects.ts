import { useState } from 'react';

import { buildDayMapProjection } from '@/application/projections/day-map';
import type { DayViewData } from '@/application/queries/day-view';
import { getMapPlaceCoordinate } from '@/application/projections/map-place';
import type { EntityId } from '@/domain/common/types';
import type { MapCameraRequest } from '@/infrastructure/map/map-models';
import { resolveTripMapStack } from '@/infrastructure/map/map-provider-policy';
import { useDaySelection } from './day-selection';
import { tripFocusStore } from './trip-focus';

export interface TimelineScrollRequest {
  itemId: EntityId;
  requestId: number;
}

interface DayFocusState {
  /** The Day this transient state belongs to. */
  dayId: EntityId;
  request: MapCameraRequest | null;
  scroll: TimelineScrollRequest | null;
  /** Map projection identity, independent of the canonical Item/Place state. */
  mapInputKey: string;
  cameraIntent: 'automatic-fit' | 'item-selection' | 'item-camera' | 'explicit-fit';
  cameraFocusItemId: EntityId | null;
  /** Monotonic across Days; a per-Day counter would collide with the last Day's key. */
  seq: number;
}

function mapInputKey(data: DayViewData, markers: ReturnType<typeof buildDayMapProjection>['markers']) {
  return JSON.stringify({
    explicitMapPlaces: data.mapPlacesById !== undefined,
    markers: markers.map((marker) => {
      const item = data.items.find(({ id }) => id === marker.id);
      const mappedPlaceId = item?.placeId === null || item?.placeId === undefined
        ? null
        : data.mapPlacesById?.[item.placeId]?.id ?? null;
      return [
        marker.id,
        mappedPlaceId,
        marker.coordinate.latitude,
        marker.coordinate.longitude,
        marker.coordinate.system,
      ];
    }),
  });
}

function sameCoordinate(
  left: MapCameraRequest['coordinates'][number],
  right: MapCameraRequest['coordinates'][number],
) {
  return left.latitude === right.latitude
    && left.longitude === right.longitude
    && left.system === right.system;
}

/**
 * Transient effects issued by user intents; selection alone never drives the camera.
 *
 * A persistent Day View receives the next Day as props instead of remounting, so
 * the state carries the Day it belongs to. When the Day changes, the guard below
 * reissues the camera for the new Day — with a request ID that keeps increasing
 * across Days — and drops any scroll intent that belonged to the previous Day.
 */
export function useDayFocusEffects(
  data: DayViewData,
  selectedItemIdOverride?: EntityId | null,
  hasUserMapInteraction = false,
) {
  const selection = useDaySelection(data.day.id);
  const selectedItemId = selectedItemIdOverride === undefined
    ? selection.selectedItemId
    : selectedItemIdOverride;
  const map = buildDayMapProjection(data);
  const currentMapInputKey = mapInputKey(data, map.markers);
  const [focus, setFocus] = useState<DayFocusState>(() => ({
    dayId: data.day.id,
    request: map.cameraRequest,
    scroll: null,
    mapInputKey: currentMapInputKey,
    cameraIntent: selectedItemId === null ? 'automatic-fit' : 'item-selection',
    cameraFocusItemId: null,
    seq: 0,
  }));

  let focusForRender = focus;
  if (focus.dayId !== data.day.id) {
    const seq = focus.seq + 1;
    const nextFocus: DayFocusState = {
      dayId: data.day.id,
      // A Day without a Place must not replay the previous Day's camera.
      request: map.cameraRequest ? { ...map.cameraRequest, requestId: seq } : null,
      scroll: null,
      mapInputKey: currentMapInputKey,
      cameraIntent: selectedItemId === null ? 'automatic-fit' : 'item-selection',
      cameraFocusItemId: null,
      seq,
    };
    setFocus(nextFocus);
    focusForRender = nextFocus;
  } else if (focus.mapInputKey !== currentMapInputKey) {
    const seq = focus.seq + 1;
    const mapSystem = resolveTripMapStack(data.trip).coordinateSystem;
    const hasUserItemFocus =
      (selectedItemId !== null || hasUserMapInteraction) && focus.cameraIntent !== 'explicit-fit';
    let request = focus.request;
    let cameraFocusItemId = focus.cameraFocusItemId;

    if (!hasUserItemFocus) {
      request = map.cameraRequest
        ? { ...map.cameraRequest, requestId: seq }
        : null;
      cameraFocusItemId = null;
    } else if (cameraFocusItemId !== null && !hasUserMapInteraction) {
      const focusedItem = data.items.find(({ id }) => id === cameraFocusItemId);
      const focusedPlace = focusedItem?.placeId === null || focusedItem?.placeId === undefined
        ? undefined
        : (data.mapPlacesById ?? data.placesById)[focusedItem.placeId];
      if (focusedPlace) {
        const focusedCoordinate = getMapPlaceCoordinate(focusedPlace);
        const alreadyFocused = request?.coordinates.length === 1
          && sameCoordinate(request.coordinates[0], focusedCoordinate);
        if (!alreadyFocused) {
          request = { coordinates: [focusedCoordinate], requestId: seq };
        }
      } else if (request?.coordinates.some(({ system }) => system !== mapSystem)) {
        // The user chose an Item, so retain the current viewport. Clear stale
        // coordinates from the previous provider instead of fitting all pins.
        request = null;
      }
    } else if (request?.coordinates.some(({ system }) => system !== mapSystem)) {
      // Selection-only intents preserve the user's viewport; a stale CRS must
      // not cross into the newly bound map renderer.
      request = null;
    }

    const nextFocus: DayFocusState = {
      ...focus,
      mapInputKey: currentMapInputKey,
      request,
      cameraFocusItemId,
      seq,
    };
    setFocus(nextFocus);
    focusForRender = nextFocus;
  }

  /**
   * Until this hook has produced the current Day's request, report nothing:
   * emitting the previous Day's coordinates under the new Day's scope would send
   * the map to the wrong place for a frame.
   */
  const isFocusedDay = focusForRender.dayId === data.day.id;

  function ensureSheetAtLeastHalf() {
    const state = tripFocusStore.getState();
    if (state.sheetSnap === 'collapsed') state.setSheetSnap('half');
  }

  function selectFromTimeline(itemId: EntityId) {
    selection.selectItem(itemId);
    ensureSheetAtLeastHalf();
    const item = data.items.find((candidate) => candidate.id === itemId);
    const place = item?.placeId ? (data.mapPlacesById ?? data.placesById)[item.placeId] : undefined;
    const coordinate = place ? getMapPlaceCoordinate(place) : undefined;
    const hasCanonicalPlace = item !== undefined && item.placeId !== null;
    const seq = focusForRender.seq + 1;
    setFocus({
      ...focusForRender,
      seq,
      cameraIntent: hasCanonicalPlace ? 'item-camera' : 'item-selection',
      cameraFocusItemId: hasCanonicalPlace ? itemId : null,
      request: coordinate
        ? { coordinates: [coordinate], requestId: seq }
        : focusForRender.request,
    });
  }

  function selectFromMap(itemId: EntityId) {
    selection.selectItem(itemId);
    ensureSheetAtLeastHalf();
    const seq = focusForRender.seq + 1;
    setFocus({
      ...focusForRender,
      seq,
      cameraIntent: 'item-selection',
      cameraFocusItemId: null,
      scroll: { itemId, requestId: seq },
    });
  }

  function selectItem(itemId: EntityId) {
    selection.selectItem(itemId);
    const seq = focusForRender.seq + 1;
    setFocus({
      ...focusForRender,
      seq,
      cameraIntent: 'item-selection',
      cameraFocusItemId: null,
    });
  }

  function fitDay() {
    const seq = focusForRender.seq + 1;
    setFocus({
      ...focusForRender,
      seq,
      cameraIntent: 'explicit-fit',
      cameraFocusItemId: null,
      request: map.cameraRequest ? { ...map.cameraRequest, requestId: seq } : null,
    });
  }

  return {
    selectedItemId: selection.selectedItemId,
    cameraRequest: isFocusedDay ? focusForRender.request : null,
    scrollRequest: isFocusedDay ? focusForRender.scroll : null,
    /**
     * Selection only. No camera and no scroll effect is issued, which is what a
     * caller needs when the Item's own projection is about to change underneath
     * it: the coordinates this hook can see are still the pre-change ones.
     */
    selectItem,
    selectFromTimeline,
    selectFromMap,
    fitDay,
  };
}
