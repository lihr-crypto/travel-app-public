import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius, spacing, typography } from '@/theme/tokens';

import type { TravelDate } from '@/domain/common/types';
import type { Day } from '@/domain/trip/types';
import { useSwipeExclusion } from './day-swipe-guard';
import { AnimatedSheetModal } from './ui/animated-sheet-modal';
import { deviceLocalTravelDate } from '@/domain/common/travel-date';
import { formatDateZhWeekday, relativeDayLabel } from './trip-date-labels';

/**
 * Horizontal distance a swipe must cover before it switches Day.
 *
 * The same number decides when the swipe takes the responder over, so a tap
 * that drifts can never be cancelled and turned into a Day change: by the time
 * the gesture qualifies, it is unambiguously not a tap.
 */
export const DAY_SWIPE_THRESHOLD = 50;
/**
 * How far a horizontal movement must dominate the vertical one before the
 * gesture is treated as a Day swipe. Vertical scrolling is never intercepted.
 */
export const DAY_SWIPE_DOMINANCE = 1.2;

/** Whether a gesture belongs to Day switching at all. */
export function shouldClaimDaySwipe(dx: number, dy: number): boolean {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  return Math.abs(dx) > DAY_SWIPE_THRESHOLD
    && Math.abs(dx) > DAY_SWIPE_DOMINANCE * Math.abs(dy);
}

export function resolveAdjacentDaySwipe(
  dx: number,
  previousDay?: Day,
  nextDay?: Day,
): Day | undefined {
  if (!Number.isFinite(dx) || Math.abs(dx) < DAY_SWIPE_THRESHOLD) return undefined;
  return dx < 0 ? nextDay : previousDay;
}

/**
 * Horizontal swipes always navigate between Days. `canBack` remains in the
 * options for callers on the existing API, but leaving Day is a separate action.
 */
export type DaySwipeIntent = { kind: 'back' } | { kind: 'day'; day: Day };

export function resolveDaySwipeIntent(
  translationX: number,
  options: { canBack: boolean; previousDay?: Day; nextDay?: Day },
): DaySwipeIntent | null {
  if (
    !Number.isFinite(translationX)
    || Math.abs(translationX) < DAY_SWIPE_THRESHOLD
  ) {
    return null;
  }
  if (translationX > 0) {
    return options.previousDay ? { kind: 'day', day: options.previousDay } : null;
  }
  return options.nextDay ? { kind: 'day', day: options.nextDay } : null;
}

export interface DayHeaderProps {
  day: Day;
  previousDay?: Day;
  nextDay?: Day;
  onSelectDay: (dayId: string) => void;
  onOpenJump: () => void;
  /** A3 relative-date anchor; defaults to the device's local travel date. */
  today?: TravelDate;
}

/**
 * The Day title, the arrows and the Jump sheet.
 *
 * The swipe itself is owned by the Bottom Sheet content that contains this
 * header. Owning a second responder here put two swipe recognisers on the same
 * touch and let one of them cancel the header's own buttons.
 */
export function DayHeader({
  day,
  previousDay,
  nextDay,
  onSelectDay,
  onOpenJump,
  today = deviceLocalTravelDate(),
}: DayHeaderProps) {
  /**
   * The arrows and the title are controls with their own action, so a drag that
   * begins on them never starts a Day swipe.
   */
  const excludeArrows = useSwipeExclusion();
  const excludeTitle = useSwipeExclusion();

  return (
    <View style={styles.container} testID="day-header">
      <Pressable
        accessibilityLabel="上一天"
        accessibilityRole="button"
        disabled={!previousDay}
        hitSlop={8}
        onPress={() => previousDay && onSelectDay(previousDay.id)}
        style={styles.arrowButton}
        testID="day-header-previous"
        {...excludeArrows}
      >
        <Text style={previousDay ? styles.control : styles.disabledControl}>‹</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="选择日期"
        accessibilityRole="button"
        onPress={onOpenJump}
        style={styles.titleButton}
        testID="day-header-title"
        {...excludeTitle}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title} testID="day-header-day-index">{`第 ${day.dayIndex} 天`}</Text>
          <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.dropdownCue}>⌄</Text>
        </View>
        <View style={styles.dateRow}>
          <Text style={styles.date}>{formatDateZhWeekday(day.date)}</Text>
          {relativeDayLabel(day.date, today) !== null ? (
            <Text style={styles.relativeDateBadge}>
              {relativeDayLabel(day.date, today)}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel="下一天"
        accessibilityRole="button"
        disabled={!nextDay}
        hitSlop={8}
        onPress={() => nextDay && onSelectDay(nextDay.id)}
        style={styles.arrowButton}
        testID="day-header-next"
        {...excludeArrows}
      >
        <Text style={nextDay ? styles.control : styles.disabledControl}>›</Text>
      </Pressable>
    </View>
  );
}

export interface DayJumpSheetProps {
  days: readonly Day[];
  currentDayId: string;
  visible: boolean;
  onClose: () => void;
  onSelectDay: (dayId: string) => void;
  /** Clears the sheet without playing the exit when the Day underneath changes. */
  resetKey?: string;
}

/**
 * Direct Day navigation surface opened by tapping the Day title.
 *
 * It stays a Bottom Sheet: only the sheet translates, the backdrop is a
 * separate full-viewport layer that fades, and a long Trip scrolls inside the
 * sheet instead of growing past the bounded height.
 */
export function DayJumpSheet({
  days,
  currentDayId,
  visible,
  onClose,
  onSelectDay,
  resetKey,
}: DayJumpSheetProps) {
  return (
    <AnimatedSheetModal
      onRequestClose={onClose}
      resetKey={resetKey}
      scrollable
      testID="day-jump-sheet"
      title="选择日期"
      visible={visible}
    >
      {days.map((entry) => (
        <Pressable
          accessibilityRole="button"
          disabled={entry.id === currentDayId}
          key={entry.id}
          onPress={() => {
            onSelectDay(entry.id);
            onClose();
          }}
          style={[styles.jumpRow, entry.id === currentDayId ? styles.currentRow : null]}
          testID={`day-jump-${entry.id}`}
        >
          <Text style={[styles.jumpDay, entry.id === currentDayId ? styles.jumpDaySelected : null]}>
            {entry.id === currentDayId ? '✓ ' : ''}
            第 {entry.dayIndex} 天 · {formatDateZhWeekday(entry.date)}
          </Text>
        </Pressable>
      ))}
    </AnimatedSheetModal>
  );
}

const styles = StyleSheet.create({
  arrowButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  currentRow: { backgroundColor: colors.accentSoft },
  jumpDay: { ...typography.body, color: colors.text },
  jumpDaySelected: { color: colors.accentStrong, fontWeight: '600' },
  jumpRow: {
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  /** `Day X + 日期` is one target and keeps the 44pt minimum height. */
  titleButton: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  dropdownCue: { color: colors.textSubtle, fontSize: 16, fontWeight: '600', marginTop: 3 },
  date: { color: colors.textMuted, fontSize: 14, fontVariant: ['tabular-nums'] },
  dateRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  relativeDateBadge: {
    backgroundColor: colors.successSurface,
    borderRadius: 6,
    color: colors.success,
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  control: { color: colors.primary, fontSize: 30, lineHeight: 32 },
  disabledControl: { color: colors.textDisabled, fontSize: 30, lineHeight: 32 },
});
