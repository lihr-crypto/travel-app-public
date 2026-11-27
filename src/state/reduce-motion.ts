import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * iOS Reduce Motion as a plain React value.
 *
 * Reanimated's own `ReduceMotion` option only covers the animation itself. The
 * planning transition also has to skip its exit/enter timers, so the preference
 * must be readable by ordinary React logic.
 */
export function useReduceMotionPreference(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (active) setEnabled(value);
      },
      () => {
        if (active) setEnabled(false);
      },
    );

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value: boolean) => setEnabled(value),
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
