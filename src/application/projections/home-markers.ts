import type { EntityId } from '@/domain/common/types';
import type { TripLifecycle } from '@/domain/trip/types';
import type { MapMarkerModel } from '@/infrastructure/map/map-models';

/**
 * The shared Home marker shape.
 *
 * Home markers are not Item occurrences, so they cannot reuse the Day/Overview
 * marker model as-is. They keep `MapMarkerModel` as the common base — which is
 * what the Apple adapter renders — and add only what Home needs: a visual
 * weight (Stage-03 §3.5: state is expressed through weight, not through
 * unrelated shapes) and the Trip identity the marker stands for.
 */

/** Stage-03 §3.5: one marker family, weight carrying the lifecycle. */
export type HomeMarkerWeight = 'weak' | 'normal' | 'emphasized';

export interface HomeMarkerModel extends MapMarkerModel {
  weight: HomeMarkerWeight;
}

/** One marker per Trip; `id` is the Trip id so a tap selects a Trip. */
export interface HomeTripMarker extends HomeMarkerModel {
  tripId: EntityId;
  tripTitle: string;
  lifecycle: TripLifecycle;
}
