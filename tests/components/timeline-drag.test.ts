import { expect, test } from '@jest/globals';

import {
  buildDisplacementUpdates,
  buildDragPreview,
  resolveDragTarget,
  resolveDropIntent,
} from '@/components/timeline-drag';

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
/** Uniform 80 pt rows at 0/80/160, as a real layout pass would measure. */
const offsets = new Map([['a', 0], ['b', 80], ['c', 160]]);
const heights = new Map([['a', 80], ['b', 80], ['c', 80]]);

test('M6-T1: a swap happens only when the finger crosses a neighbouring centre', () => {
  // B rests at centre 120. A 10 pt drift has not crossed anything.
  expect(resolveDragTarget('b', 10, rows, offsets, heights)).toBeNull();
  expect(resolveDragTarget('b', -10, rows, offsets, heights)).toBeNull();
  // Crossing C's centre (200) targets C; crossing A's centre (40) targets A.
  expect(resolveDragTarget('b', 90, rows, offsets, heights)).toBe('c');
  expect(resolveDragTarget('b', -90, rows, offsets, heights)).toBe('a');
  // A fast fling past several rows lands where the finger is, not one slot short.
  expect(resolveDragTarget('a', 250, rows, offsets, heights)).toBe('c');
  expect(resolveDragTarget('c', -250, rows, offsets, heights)).toBe('a');
});

test('M6-T1: rows without measurements produce no target', () => {
  expect(resolveDragTarget('missing', 10, rows, offsets, heights)).toBeNull();
});

test('M6-T2: the preview re-inserts the dragged row at the target slot', () => {
  expect(buildDragPreview(rows, 'b', 'c').map(({ id }) => id)).toEqual(['a', 'c', 'b']);
  expect(buildDragPreview(rows, 'c', 'a').map(({ id }) => id)).toEqual(['c', 'a', 'b']);
  // Idempotent: repeated updates compute from the original order, so the same
  // target keeps the same arrangement.
  expect(buildDragPreview(rows, 'b', 'c')).toEqual(buildDragPreview(rows, 'b', 'c'));
  expect(buildDragPreview(rows, 'b', 'b')).toEqual(rows);
  expect(buildDragPreview(rows, 'missing', 'a')).toEqual(rows);
});

test('M6-T4: the drop intent is relative and null when nothing moved', () => {
  const movedDown = buildDragPreview(rows, 'b', 'c');
  expect(resolveDropIntent('b', movedDown, rows)).toEqual({
    type: 'after', itemId: 'c',
  });
  const movedUp = buildDragPreview(rows, 'c', 'a');
  expect(resolveDropIntent('c', movedUp, rows)).toEqual({
    type: 'before', itemId: 'a',
  });
  expect(resolveDropIntent('a', rows, rows)).toBeNull();
  // A stale preview from another Day can never resolve into a write.
  expect(resolveDropIntent('ghost', movedDown, rows)).toBeNull();
});


test('UX-C: displacements push each crossed row exactly one slot aside', () => {
  // A dragged one slot down past B: B starts a slot low (springs up), C is
  // untouched.
  const afterB = buildDragPreview(rows, 'a', 'b');
  expect(buildDisplacementUpdates(rows, afterB, 'a', 88)).toEqual({ b: 88 });
  // A two-slot fling pushes both crossed rows, each by exactly one slot.
  const afterC = buildDragPreview(rows, 'a', 'c');
  expect(buildDisplacementUpdates(rows, afterC, 'a', 88)).toEqual({ b: 88, c: 88 });
  // Dragging up: the crossed row starts a slot high and settles down.
  const up = buildDragPreview(rows, 'c', 'a');
  expect(buildDisplacementUpdates(rows, up, 'c', 88)).toEqual({ a: -88, b: -88 });
  // An unchanged arrangement displaces nobody.
  expect(buildDisplacementUpdates(rows, rows, 'a', 88)).toEqual({});
});
