import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EntityId } from '@/domain/common/types';
import type { HomeActiveTrip } from '@/application/projections/home-map';
import { colors } from '@/theme/tokens';

/**
 * M10-T5 — the Active Trip Card.
 *
 * Stage-03 §3.4 defines exactly two states, and requires the card to stay
 * "compact enough not to obscure the map":
 *
 * ```text
 * ● 正在旅行 Day 3            ● 正在旅行
 * 示例秋季自驾 >          示例秋季自驾
 *                            Day 3 · 北山 -> 南湾
 *                            继续今天的行程 ->
 * ```
 *
 * The Day summary is the Day's first and last saved Place names. V1 has no Leg,
 * so the card never implies a route: a Day with one Place shows that Place
 * alone, and a Day with none shows just `Day N`.
 */

/** `Day 3 · 北山 -> 南湾`, degrading honestly when the Day has fewer Places. */
export function formatActiveDayLine(trip: HomeActiveTrip): string {
  const day = `Day ${trip.dayIndex}`;
  if (trip.fromLabel === null) return day;
  if (trip.toLabel === null) return `${day} · ${trip.fromLabel}`;
  return `${day} · ${trip.fromLabel} -> ${trip.toLabel}`;
}

export interface HomeActiveTripCardProps {
  trip: HomeActiveTrip;
  /** Controlled when defined; otherwise the card owns it. */
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  /** Absent means this build cannot continue — no seam, no action. */
  onContinueToday?: (tripId: EntityId, dayId: EntityId) => void;
}

export function HomeActiveTripCard({
  trip,
  expanded,
  onToggle,
  onContinueToday,
}: HomeActiveTripCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded === undefined ? internalExpanded : expanded;

  const toggle = () => {
    if (expanded === undefined) setInternalExpanded(!isExpanded);
    onToggle?.(!isExpanded);
  };

  return (
    <View style={styles.card} testID="home-active-trip-card">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={toggle}
        testID="home-active-trip-toggle"
      >
        <View style={styles.headline}>
          <View style={styles.dot} />
          <Text style={styles.badge}>正在旅行</Text>
          {isExpanded ? null : (
            <Text style={styles.compactDay} testID="home-active-trip-compact-day">
              Day {trip.dayIndex}
            </Text>
          )}
        </View>
        <Text numberOfLines={1} style={styles.title} testID="home-active-trip-title">
          {trip.tripTitle}
        </Text>
      </Pressable>

      {isExpanded ? (
        <>
          <Text style={styles.day} testID="home-active-trip-day">
            {formatActiveDayLine(trip)}
          </Text>
          {onContinueToday ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onContinueToday(trip.tripId, trip.dayId)}
              style={styles.continue}
              testID="home-active-trip-continue"
            >
              <Text style={styles.continueLabel}>继续今天的行程</Text>
              <Text style={styles.continueArrow}>→</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
    padding: 12,
    shadowColor: colors.text,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  compactDay: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  continue: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingTop: 2 },
  continueArrow: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  continueLabel: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  day: { color: colors.textSecondary, fontSize: 13 },
  dot: { backgroundColor: colors.success, borderRadius: 4, height: 8, width: 8 },
  headline: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700', paddingTop: 2 },
});
