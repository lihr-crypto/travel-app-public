import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/tokens';

/**
 * M10-T7 — the Create Trip affordance on Home.
 *
 * Stage-03 §3.2 puts `[+]` in the 我的旅行 sheet's heading row, and §3.7 asks for
 * a circular `+` once Trips exist. One control satisfies both: a circular button
 * in the heading row. §3.7's first-use state is the same intent with different
 * weight, which is why the label is a prop rather than hard-coded chrome.
 */
export interface HomeCreateTripFabProps {
  onPress: () => void;
  /** `+` on its own once Trips exist; `+ 新建旅行` in the first-use state. */
  label?: string;
  accessibilityLabel?: string;
}

export function HomeCreateTripFab({
  onPress,
  label = '+',
  accessibilityLabel = '新建旅行',
}: HomeCreateTripFabProps) {
  const isCompact = label === '+';
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={isCompact ? styles.fab : styles.wide}
      testID="home-create-trip"
    >
      {isCompact ? (
        <View accessible={false} pointerEvents="none" style={styles.plus}>
          <View style={styles.plusHorizontal} />
          <View style={styles.plusVertical} />
        </View>
      ) : (
        <Text style={styles.wideLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  plus: { height: 14, width: 14 },
  plusHorizontal: {
    backgroundColor: colors.onPrimary,
    borderRadius: 1,
    height: 2,
    left: 0,
    position: 'absolute',
    top: 6,
    width: 14,
  },
  plusVertical: {
    backgroundColor: colors.onPrimary,
    borderRadius: 1,
    height: 14,
    left: 6,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  wide: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  wideLabel: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
});
