import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { HomeTripFilter } from '@/application/projections/home-map';
import { colors } from '@/theme/tokens';

/**
 * M10-T4 — the Home lifecycle filter.
 *
 * Stage-03 §3.3 fixes the control exactly: a segmented `全部 | 计划中 | 已完成`,
 * with **no `旅行中` option** — an active Trip stays visible under `全部` and is
 * surfaced separately by the Active Trip Card (M10-T5). The filter itself lives
 * in `buildHomeMapProjection`, which is where the rule that 计划中 excludes an
 * active Trip is tested; this component only reports the chosen value.
 */

/** Left-to-right order, which is also the visual order. */
export const HOME_TRIP_FILTERS: readonly HomeTripFilter[] = ['all', 'planned', 'completed'];

const FILTER_LABELS: Record<HomeTripFilter, string> = {
  all: '全部',
  completed: '已完成',
  planned: '计划中',
};

export interface HomeTripFilterControlProps {
  value: HomeTripFilter;
  onChange: (filter: HomeTripFilter) => void;
}

export function HomeTripFilterControl({ value, onChange }: HomeTripFilterControlProps) {
  return (
    <View accessibilityRole="tablist" style={styles.container} testID="home-trip-filter">
      {HOME_TRIP_FILTERS.map((option) => {
        const isSelected = option === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            aria-selected={isSelected}
            key={option}
            onPress={() => onChange(option)}
            style={[styles.option, isSelected ? styles.optionSelected : null]}
            testID={`home-trip-filter-${option}`}
          >
            <Text style={isSelected ? styles.labelSelected : styles.label}>
              {FILTER_LABELS[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    shadowColor: colors.text,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  labelSelected: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  option: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  optionSelected: { backgroundColor: colors.accent },
});
