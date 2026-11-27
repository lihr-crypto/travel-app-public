import type { Coordinate } from '@/domain/common/types';
import type {
  PlaceSearchResult,
  PlaceProviderId,
  ReverseGeocodeResult,
} from '@/infrastructure/place/place-provider';
import { resolveCoordinatePlaceName } from './place-snapshot';

/**
 * A Place the user has chosen but not yet committed.
 *
 * Picking a location only replaces this pending selection; the Place row and the
 * Item's `placeId` are written when the Item editor commits its draft. That is
 * what keeps "更换地点" from silently rewriting an Item the user then abandons.
 *
 * Structurally a subset of `ChangeItemPlaceTarget`, so a committed target and a
 * pending one are the same shape and can be handed to the same command.
 */
export type PlaceSelectionTarget =
  | Readonly<{ kind: 'search'; result: PlaceSearchResult }>
  | Readonly<{
      kind: 'map-picker';
      coordinate: Coordinate;
      provider?: PlaceProviderId;
      enrichment: ReverseGeocodeResult | null;
    }>
  | Readonly<{ kind: 'none' }>;

/**
 * The name the pending selection will be saved under.
 *
 * The Map Picker resolves a coordinate the same way `changeItemPlace` will, so
 * the editor never shows a label the commit would contradict. `none` has no
 * name of its own.
 */
export function pendingPlaceName(target: PlaceSelectionTarget | null): string | null {
  if (target === null) return null;
  switch (target.kind) {
    case 'search':
      return target.result.name;
    case 'map-picker':
      return resolveCoordinatePlaceName(target.enrichment, target.coordinate);
    case 'none':
      return null;
  }
}
