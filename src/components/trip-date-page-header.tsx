import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, spacing, typography } from '@/theme/tokens';

export interface TripDatePageHeaderProps {
  title: string;
  /** Absent on the entry page, which is dismissed rather than stepped back. */
  onBack?: () => void;
  /** Absent on sub-pages, which step back instead of dismissing the sheet. */
  onClose?: () => void;
  testID: string;
}

/**
 * One header for every page of the Trip date sheet.
 *
 * The date sheet is a small stack, not a second navigation system: it reuses the
 * app's screen-title weight and its accent-coloured text action, so stepping
 * between pages never changes the visual language.
 */
export function TripDatePageHeader({
  title,
  onBack,
  onClose,
  testID,
}: TripDatePageHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.leading}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={styles.action}
            testID={`${testID}-back`}
          >
            <Text style={styles.actionText}>返回</Text>
          </Pressable>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.title} testID={`${testID}-title`}>
        {title}
      </Text>
      <View style={[styles.leading, styles.trailing]}>
        {onClose ? (
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.action}
            testID={`${testID}-close`}
          >
            <Text style={styles.actionText}>关闭</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  actionText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  leading: { flex: 1 },
  title: {
    ...typography.sectionTitle,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'center',
  },
  trailing: { alignItems: 'flex-end' },
});
