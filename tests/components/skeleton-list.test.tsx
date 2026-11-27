import { expect, test } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
import { act, create } from 'react-test-renderer';

import { SkeletonList } from '@/components/ui/skeleton-list';
import { colors } from '@/theme/tokens';

test('A4: the skeleton mirrors the Day List row shape, bars per row', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<SkeletonList rows={4} testID="trip-planning-loading" />);
  });

  const bars = renderer.root
    .findAllByType(View)
    .filter(({ props }) => StyleSheet.flatten(props.style)?.backgroundColor === colors.surfaceMuted);
  // Four rows of two muted bars each — the Day List row shape at a glance.
  expect(bars).toHaveLength(8);
  act(() => renderer.unmount());
});
