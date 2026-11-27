import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius, spacing, typography } from '@/theme/tokens';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface AppButtonProps {
  title: string;
  onPress?: () => void;
  testID?: string;
  disabled?: boolean;
  variant?: AppButtonVariant;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Replaces the platform `Button` so every action shares one shape, weight and
 * hit area. `testID`, `onPress` and `disabled` all sit on the pressable itself,
 * which keeps the existing component tests able to drive it directly.
 */
export function AppButton({
  title,
  onPress,
  testID,
  disabled = false,
  variant = 'primary',
  accessibilityLabel,
  style,
}: AppButtonProps) {
  const isDisabled = disabled || !onPress;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled ? styles.disabled : null,
        pressed && !isDisabled ? styles.pressed : null,
        style,
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.label,
          variant === 'primary' ? styles.labelOnPrimary : styles.labelOnSurface,
          isDisabled ? styles.labelDisabled : null,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
  },
  disabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderSubtle,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
  },
  labelOnPrimary: {
    color: colors.onPrimary,
  },
  labelDisabled: { color: colors.textSubtle },
  labelOnSurface: {
    color: colors.primary,
  },
  pressed: {
    opacity: 0.75,
  },
});

const variantStyles = StyleSheet.create({
  ghost: {
    paddingHorizontal: spacing.sm,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
});
