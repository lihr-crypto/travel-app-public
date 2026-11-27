import type { EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';

/**
 * Canonical delete snapshot (Stage-05 §9, Stage-06 C-09): the full Item plus
 * its nearest neighbours in the owning collection, so restoreDeletedItem() can
 * rebuild the relative position. Place and Leg data are intentionally not
 * snapshotted — the referenced Place row survives the delete untouched.
 */
export type DeletedItemSnapshot = {
  item: Item;
  previousItemId: EntityId | null;
  nextItemId: EntityId | null;
};
