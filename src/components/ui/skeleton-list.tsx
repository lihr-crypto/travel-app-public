import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

export interface SkeletonListProps {
  /** Placeholder row count; matches the surface's usual row budget. */
  rows?: number;
  testID?: string;
}

/**
 * A4: shape-matched loading placeholders (NN Group's skeleton-screen rule —
 * a skeleton that mirrors the final card layout beats a spinner on perceived
 * speed). Static muted bars, no animation, so Reduce Motion costs nothing.
 */
export function SkeletonList({ rows = 4, testID = 'skeleton-list' }: SkeletonListProps) {
  return (
    <View style={styles.container} testID={testID}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.row}>
          <View style={[styles.bar, styles.titleBar]} />
          <View style={[styles.bar, styles.metaBar]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    height: 14,
  },
  container: {
    gap: 18,
    padding: 16,
  },
  metaBar: {
    width: '58%',
  },
  row: {
    gap: 8,
  },
  titleBar: {
    width: '72%',
  },
});
