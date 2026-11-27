import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

/**
 * Screens own their top safe-area inset because the router header is hidden, so
 * every component test that mounts a screen needs a provider. Metrics match the
 * iPhone values already used by the Trip back-button test.
 */
export const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function SafeAreaTestProvider({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      {children}
    </SafeAreaProvider>
  );
}
