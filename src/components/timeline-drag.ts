import type { ItemPosition } from '@/application/item/position';

/**
 * Long-press duration that arms a row for dragging. UX-C (2026-10-05 device
 * pass): raised from 300 ms — with synthetic row scrolling in the same pan, a
 * deliberate long-press must be unmistakably slower than a scroll start.
 */
export const DRAG_ACTIVATION_MS = 500;

/** Finger drift that turns a hold into a scroll and cancels the arm. */
export const DRAG_SLOP = 12;

/** Fallback for rows the layout pass has not measured yet. */
export const DEFAULT_ROW_HEIGHT = 72;

export type ReorderDropIntent = Extract<ItemPosition, { type: 'before' | 'after' }>;

/**
 * The row the dragged row has actually crossed, if any.
 *
 * `translationY` is the finger's travel since activation, so the dragged centre
 * is its measured resting slot plus the finger travel. A swap happens only when
 * that centre has crossed the neighbouring row's own centre — a small drift
 * never reorders, which is the hysteresis that keeps the list from oscillating.
 * Walking outward from the dragged slot returns the farthest crossed row, so a
 * fast fling lands where the finger is, not one slot short.
 */
export function resolveDragTarget(
  draggedId: string,
  translationY: number,
  originalOrder: readonly { id: string }[],
  offsets: ReadonlyMap<string, number>,
  heights: ReadonlyMap<string, number>,
): string | null {
  const draggedTop = offsets.get(draggedId);
  if (draggedTop === undefined) return null;
  const draggedHeight = heights.get(draggedId) ?? DEFAULT_ROW_HEIGHT;
  const draggedCenter = draggedTop + draggedHeight / 2 + translationY;

  const centerOf = (id: string): number | null => {
    const top = offsets.get(id);
    return top === undefined ? null : top + (heights.get(id) ?? DEFAULT_ROW_HEIGHT) / 2;
  };

  const index = originalOrder.findIndex(({ id }) => id === draggedId);
  if (index < 0) return null;

  if (translationY > 0) {
    let target: string | null = null;
    for (let i = index + 1; i < originalOrder.length; i += 1) {
      const center = centerOf(originalOrder[i].id);
      if (center === null) continue;
      if (center <= draggedCenter) {
        target = originalOrder[i].id;
        continue;
      }
      break;
    }
    return target;
  }

  if (translationY < 0) {
    let target: string | null = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      const center = centerOf(originalOrder[i].id);
      if (center === null) continue;
      if (center >= draggedCenter) {
        target = originalOrder[i].id;
        continue;
      }
      break;
    }
    return target;
  }

  return null;
}

/**
 * The local preview arrangement for a drag onto `targetId`: the original order
 * with the dragged Item re-inserted at the target's slot. Computed from the
 * original order every time, so repeated updates are idempotent.
 */
export function buildDragPreview<T extends { id: string }>(
  originalOrder: readonly T[],
  draggedId: string,
  targetId: string,
): readonly T[] {
  const from = originalOrder.findIndex(({ id }) => id === draggedId);
  const targetIndex = originalOrder.findIndex(({ id }) => id === targetId);
  if (from < 0 || targetIndex < 0 || from === targetIndex) return originalOrder;

  const preview = originalOrder.filter(({ id }) => id !== draggedId);
  const insertAt = preview.findIndex(({ id }) => id === targetId);
  // Moving down lands after the target; moving up lands before it.
  preview.splice(targetIndex > from ? insertAt + 1 : insertAt, 0, originalOrder[from]);
  return preview;
}

/**
 * M6-T4: converts the settled preview back into the relative-position intent
 * `reorderItem()` understands. `null` means the Item never left its slot — no
 * intent, no write.
 */
export function resolveDropIntent(
  draggedId: string,
  previewOrder: readonly { id: string }[],
  originalOrder: readonly { id: string }[],
): ReorderDropIntent | null {
  const previewIndex = previewOrder.findIndex(({ id }) => id === draggedId);
  const originalIndex = originalOrder.findIndex(({ id }) => id === draggedId);
  if (previewIndex < 0 || originalIndex < 0 || previewIndex === originalIndex) {
    return null;
  }

  if (previewIndex < originalIndex) {
    const anchor = previewOrder[previewIndex + 1];
    return anchor === undefined ? null : { type: 'before', itemId: anchor.id };
  }
  const anchor = previewOrder[previewIndex - 1];
  return anchor === undefined ? null : { type: 'after', itemId: anchor.id };
}

/**
 * UX-C — the room-making animation, as data.
 *
 * When the preview re-arranges, every row the dragged card crossed must slide
 * exactly one slot (the card's height plus the list gap) towards the vacated
 * space. The returned offsets are the *initial* translateY each row springs
 * from: a row moving up starts one slot low and settles upward, which reads as
 * the card pushing it aside. Rows that did not change slots are absent.
 */
export function buildDisplacementUpdates(
  previousOrder: readonly { id: string }[],
  nextOrder: readonly { id: string }[],
  draggedId: string,
  slotSize: number,
): Readonly<Record<string, number>> {
  const updates: Record<string, number> = {};
  for (let index = 0; index < nextOrder.length; index += 1) {
    const { id } = nextOrder[index];
    if (id === draggedId) continue;
    const previousIndex = previousOrder.findIndex((candidate) => candidate.id === id);
    if (previousIndex < 0 || previousIndex === index) continue;
    updates[id] = (previousIndex - index) * slotSize;
  }
  return updates;
}
