import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/tokens';

export interface UndoSnackbarProps {
  visible: boolean;
  /** The `已删除「…」` line. An `error` replaces nothing — it renders beneath. */
  message: string;
  /**
   * Failure text (delete or undo). While it is set the bar keeps showing so the
   * user can retry 撤销; the workspace drops the snapshot itself when the
   * failure is hopeless (see `describeUndoFailure`).
   */
  error?: string | null;
  /** Runs `restoreDeletedItem()` against the held snapshot. Absent hides 撤销. */
  onUndo?: () => void;
  /**
   * The snapshot's expiry: called once after `durationMs`. The parent drops the
   * snapshot there, which is what makes the delete permanent.
   */
  onExpire: () => void;
  /** Stage-03 §6.11: approximately 5 seconds. */
  durationMs?: number;
  testID?: string;
}

/**
 * Stage-03 §6.11 Undo Snackbar: the Item is already deleted when this shows,
 * and 撤销 is the only restore path. A new delete restarts the timer, so a
 * rapid second delete never silently extends the first snapshot's life.
 */
export function UndoSnackbar({
  visible,
  message,
  error = null,
  onUndo,
  onExpire,
  durationMs = 5000,
  testID = 'undo-snackbar',
}: UndoSnackbarProps) {
  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(onExpire, durationMs);
    return () => clearTimeout(timer);
  }, [visible, message, durationMs, onExpire]);

  if (!visible) return null;

  return (
    <View style={styles.bar} testID={testID} pointerEvents="box-none">
      <View style={styles.surface}>
        <View style={styles.textRegion}>
          {message !== '' ? (
            <Text style={styles.message} numberOfLines={2}>
              {message}
            </Text>
          ) : null}
          {error !== null ? (
            <Text style={styles.error} numberOfLines={2}>
              {error}
            </Text>
          ) : null}
        </View>
        {onUndo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="撤销删除"
            hitSlop={8}
            onPress={onUndo}
            style={styles.action}
            testID="undo-snackbar-undo"
          >
            <Text style={styles.actionLabel}>撤销</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  actionLabel: {
    ...typography.body,
    color: colors.accentSoft,
    fontWeight: '700',
  },
  bar: {
    bottom: spacing.lg,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 50,
  },
  error: {
    ...typography.caption,
    color: '#fda29b',
    marginTop: spacing.xs,
  },
  message: {
    ...typography.body,
    color: colors.onPrimary,
    flexShrink: 1,
  },
  surface: {
    alignItems: 'center',
    backgroundColor: colors.text,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textRegion: {
    flex: 1,
  },
});
