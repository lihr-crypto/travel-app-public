import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Button,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '@/theme/tokens';

type InitializationState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { error: unknown; status: 'error' };

interface InitializationGateProps {
  children: ReactNode;
  initialize: () => Promise<void>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function InitializationGate({
  children,
  initialize,
}: InitializationGateProps) {
  const [state, setState] = useState<InitializationState>({ status: 'loading' });
  const attemptRef = useRef(0);

  const beginInitialization = useCallback(() => {
    const attempt = ++attemptRef.current;

    void initialize().then(
      () => {
        if (attemptRef.current === attempt) {
          setState({ status: 'ready' });
        }
      },
      (error: unknown) => {
        if (attemptRef.current === attempt) {
          setState({ error, status: 'error' });
        }
      },
    );
  }, [initialize]);

  const retryInitialization = useCallback(() => {
    setState({ status: 'loading' });
    beginInitialization();
  }, [beginInitialization]);

  useEffect(() => {
    beginInitialization();
  }, [beginInitialization]);

  if (state.status === 'loading') {
    return (
      <View style={styles.container} testID="initialization-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.message}>Preparing Travel App…</Text>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.container} testID="initialization-error">
        <Text style={styles.title}>Travel App could not start</Text>
        <Text style={styles.message} testID="initialization-error-detail">
          {errorMessage(state.error)}
        </Text>
        <Button
          color={colors.primary}
          title="Retry"
          onPress={retryInitialization}
          testID="initialization-retry"
        />
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
});
