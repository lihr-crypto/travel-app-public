import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/tokens';

export interface EmptyHintProps {
  /** One plain sentence saying what is (not) here. */
  title: string;
  /** The next action, in the user's words. Absent keeps just the title. */
  hint?: string;
  testID?: string;
}

/**
 * The A2 empty-state formula (visual restraint + explanation + next step):
 * an empty surface never shows just a grey word — it says what is missing and
 * where to go next, using affordances that already exist on the surface.
 */
export function EmptyHint({ title, hint, testID = 'empty-hint' }: EmptyHintProps) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      {hint !== undefined ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  hint: {
    color: colors.textSubtle,
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  title: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
