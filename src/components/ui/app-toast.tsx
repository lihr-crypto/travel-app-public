import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

/** How long a confirmation stays on screen before dismissing itself. */
export const APP_TOAST_DURATION_MS = 2800;

export interface AppToastProps {
  /** `null` renders nothing, which is also the initial state. */
  message: string | null;
  onDismiss?: () => void;
  /** Distance from the safe-area top; the caller clears its own chrome. */
  topOffset?: number;
  testID?: string;
}

/**
 * Transient confirmation for a completed write.
 *
 * The app already reports failures through an inline banner pinned under the
 * Back control (`trip-navigation-error`), so success uses the same slot and
 * chrome instead of introducing a second feedback language. It never blocks
 * input and it never replaces the write's own inline error.
 */
export function AppToast({
  message,
  onDismiss,
  topOffset = 0,
  testID = 'app-toast',
}: AppToastProps) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (message === null) return undefined;
    const timer = setTimeout(() => dismissRef.current?.(), APP_TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (message === null) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[styles.container, { top: topOffset }]}
      testID={testID}
    >
      <Text style={styles.message} testID={`${testID}-message`}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    left: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    position: 'absolute',
    right: spacing.md,
    zIndex: 30,
  },
  message: {
    ...typography.label,
    color: colors.text,
    textAlign: 'center',
  },
});
