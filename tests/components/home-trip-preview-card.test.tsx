import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import {
  HomeTripPreviewCard,
  type HomeTripPreview,
  type HomeTripPreviewEntry,
} from '@/components/home-trip-preview-card';

/**
 * The workspace suite drives the card end to end; this one covers the branches
 * it cannot reach through that path — a cluster whose rows are not selectable,
 * and a preview with no entry seam at all.
 */
const beijing2026: HomeTripPreviewEntry = {
  dayCount: 7, endDate: '2026-10-07', placeCount: 11, startDate: '2026-10-01',
  title: '2026 国庆北京', tripId: 'bj-2026',
};
const beijing2027: HomeTripPreviewEntry = {
  dayCount: 5, endDate: '2027-04-05', placeCount: 8, startDate: '2027-04-01',
  title: '2027 春季北京', tripId: 'bj-2027',
};

function render(preview: HomeTripPreview, props: {
  onEnterTrip?: (tripId: string) => void;
  onSelectTrip?: (tripId: string) => void;
  selectedTripId?: string | null;
} = {}) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <HomeTripPreviewCard onClose={jest.fn()} preview={preview} {...props} />,
    );
  });
  return renderer;
}

test('M10-T3: a single-Trip preview shows the Trip and its range, with no list', () => {
  const renderer = render({
    kind: 'trip',
    trip: beijing2026,
  }, { onEnterTrip: jest.fn() });

  expect(renderer.root.findByProps({ testID: 'home-trip-preview-heading' }).props.children)
    .toBe('2026 国庆北京');
  expect(JSON.stringify(renderer.toJSON())).toContain('10月1日');
  // A single Trip is its own choice, so it needs no list and no hint.
  expect(renderer.root.findAllByProps({ testID: 'home-trip-preview-trip-bj-2026' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'home-trip-preview-enter' })).toBeDefined();
  act(() => renderer.unmount());
});

test('M10-T3: cluster rows are inert when the surface cannot select, and entry needs a choice', () => {
  const onEnterTrip = jest.fn();
  const renderer = render({
    kind: 'cluster',
    label: '北京 · 2 次旅行',
    trips: [beijing2026, beijing2027],
  }, { onEnterTrip });

  // The heading is the marker's own label, so the badge and the card agree.
  expect(renderer.root.findByProps({ testID: 'home-trip-preview-heading' }).props.children)
    .toBe('北京 · 2 次旅行');
  expect(renderer.root.findByProps({ testID: 'home-trip-preview-trip-bj-2026' }).props.onPress)
    .toBeUndefined();
  // No member chosen yet, so there is nothing to enter.
  expect(renderer.root.findAllByProps({ testID: 'home-trip-preview-enter' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('M10-T3: a chosen member becomes the entry target, and without a seam there is no action', () => {
  const onEnterTrip = jest.fn();
  const renderer = render({
    kind: 'cluster',
    label: '北京 · 2 次旅行',
    trips: [beijing2026, beijing2027],
  }, { onEnterTrip, selectedTripId: 'bj-2027' });

  act(() => renderer.root.findByProps({ testID: 'home-trip-preview-enter' }).props.onPress());
  expect(onEnterTrip).toHaveBeenCalledWith('bj-2027');
  act(() => renderer.unmount());

  // No seam, no action — the same rule the external-map and edit actions follow.
  const withoutSeam = render({ kind: 'trip', trip: beijing2026 });
  expect(withoutSeam.root.findAllByProps({ testID: 'home-trip-preview-enter' })).toHaveLength(0);
  act(() => withoutSeam.unmount());
});

test('A1: the single-Trip preview carries the content summary', () => {
  const renderer = render({ kind: 'trip', trip: beijing2026 }, { onEnterTrip: jest.fn() });
  const text = renderer.root
    .findAllByProps({ testID: 'home-trip-preview' })[0]
    .findAllByType(require('react-native').Text)
    .map(({ props }) => (typeof props.children === 'string' ? props.children : ''))
    .join('\n');
  expect(text).toContain('7 天 · 11 个地点');
  act(() => renderer.unmount());
});
