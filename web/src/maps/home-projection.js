import coordtransform from 'coordtransform';
import { assertCoordinate } from '@/domain/common/coordinate';
import { buildHomeMapProjection } from '@/application/projections/home-map';
import { projectAmapPlaceForMap, projectSavedWgs84PlaceForMap } from '@/application/projections/map-place';

/** Display-only inverse, using the same residual/iteration gate as the iOS adapter. */
export function homeDisplayCoordinate(coordinate) {
  assertCoordinate(coordinate);
  if (coordinate.system === 'wgs84') return { ...coordinate };
  let latitude = coordinate.latitude, longitude = coordinate.longitude;
  for (let attempt = 0; attempt < 12; attempt++) {
    const projected = coordtransform.wgs84togcj02(longitude, latitude);
    const dy = coordinate.latitude - projected[1], dx = coordinate.longitude - projected[0];
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError('Invalid Home display coordinate');
    if (Math.max(Math.abs(dx), Math.abs(dy)) <= 5e-7) return { latitude, longitude, system: 'wgs84' };
    latitude += dy; longitude += dx;
  }
  throw new RangeError('Home display coordinate did not converge');
}

/** Share the App's anchors, filters, lifecycle weights, and current-Day camera rules. */
export function webHomeProjection(state, options) {
  const places = Object.fromEntries(state.places.map(place => [place.id, place]));
  const displayed = {};
  for (const place of state.places) {
    try {
      if (place.provider === 'amap') displayed[place.id] = projectAmapPlaceForMap(place, homeDisplayCoordinate(place.coordinate));
      else if (place.provider === 'google' || place.provider === 'apple') displayed[place.id] = projectSavedWgs84PlaceForMap(place);
    } catch { /* Unresolvable legacy locations never remove their Trip from the list. */ }
  }
  const trips = state.trips.map(trip => {
    const items = state.items.filter(item => item.tripId === trip.id);
    const ids = [...new Set(items.map(item => item.placeId).filter(Boolean))];
    return {
      trip, items, days: state.days.filter(day => day.tripId === trip.id),
      placesById: Object.fromEntries(ids.filter(id => places[id]).map(id => [id, places[id]])),
      mapPlacesById: Object.fromEntries(ids.filter(id => displayed[id]).map(id => [id, displayed[id]])),
    };
  });
  // This existing flag selects the shared WGS84 presentation path, not a Web SDK.
  return buildHomeMapProjection({ trips }, { ...options, appleCoordinates: true });
}

export function focusFootprintCamera(map, request) {
  const coordinates = request?.coordinates;
  if (!coordinates?.length) return;
  if (coordinates.length === 1) {
    map.jumpTo({ center: [coordinates[0].longitude, coordinates[0].latitude] });
    return;
  }
  const latitudes = coordinates.map(point => point.latitude), longitudes = coordinates.map(point => point.longitude);
  map.fitBounds([[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]], {
    padding: { top: 36, right: 32, bottom: 44, left: 32 }, maxZoom: 14, duration: 0,
  });
}
