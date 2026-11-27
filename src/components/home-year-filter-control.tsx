import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/tokens';

/**
 * Home year filter — a second, quieter row under the lifecycle filter.
 *
 * The lifecycle control (全部 | 计划中 | 已完成) stays exactly as Stage-03 §3.3
 * fixes it; this row only refines it by the year a Trip starts in. It is plain
 * text rather than a second segmented pill so the two levels read as coarse →
 * fine, and it wraps instead of scrolling sideways: a horizontal scroller inside
 * the draggable bottom sheet competes with the sheet's own gestures, and a
 * person's trips span a handful of years, not dozens.
 *
 * The row is hidden when there is nothing to choose between; the projection
 * reports no active year in that case, so no filter can be left behind unseen.
 */

export interface HomeYearFilterControlProps {
  /** Start years the current lifecycle filter has Trips in, newest first. */
  years: readonly number[];
  /** The applied year, or `null` for 全部年份. */
  value: number | null;
  onChange: (year: number | null) => void;
}

const ALL_YEARS_LABEL = '全部年份';

export function HomeYearFilterControl({ years, value, onChange }: HomeYearFilterControlProps) {
  if (years.length < 2) return null;
  const options: readonly (number | null)[] = [null, ...years];

  return (
    <View
      accessibilityLabel="按年份筛选"
      accessibilityRole="tablist"
      style={styles.container}
      testID="home-year-filter"
    >
      {options.map((option) => {
        const isSelected = option === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            aria-selected={isSelected}
            hitSlop={4}
            key={option ?? 'all'}
            onPress={() => onChange(option)}
            style={styles.option}
            testID={`home-year-filter-${option ?? 'all'}`}
          >
            <Text style={isSelected ? styles.labelSelected : styles.label}>
              {option === null ? ALL_YEARS_LABEL : String(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { columnGap: 20, flexDirection: 'row', flexWrap: 'wrap' },
  label: {
    color: colors.textSubtle,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  labelSelected: {
    color: colors.primary,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  option: { justifyContent: 'center', minHeight: 36 },
});
