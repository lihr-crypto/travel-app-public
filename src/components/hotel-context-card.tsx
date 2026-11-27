import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/tokens';

import type { HotelContext } from '@/application/projections/hotel-context';

export interface HotelContextCardProps {
  context: HotelContext;
  testID?: string;
}

/**
 * Stage-02 §11.3 contextual accommodation card, shown at the top of a Day that
 * a cross-day Hotel Item spans but does not own: `🏨 今晚住宿 · {title}` on an
 * intermediate night, `🏨 今早退房 · {title} / 退房 {time}` on the checkout Day.
 * The card is display-only — the Hotel is edited on its own check-in Day row.
 */
export function HotelContextCard({
  context,
  testID = 'hotel-context-card',
}: HotelContextCardProps) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.label}>
        {context.kind === 'stay' ? `今晚住宿 · ${context.title}` : `今早退房 · ${context.title}`}
      </Text>
      {context.kind === 'checkout' && context.checkOutTime !== null ? (
        <Text style={styles.detail}>退房 {context.checkOutTime}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderSubtle,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  label: {
    ...typography.label,
    color: colors.text,
  },
});
