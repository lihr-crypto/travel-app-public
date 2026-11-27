import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/tokens';

import type { ValidationIssue } from '@/domain/validation';
import type { ValidationIssueRowModel } from '@/application/trip/validation-issue-presentation';

export interface ValidationIssueListProps {
  rows: readonly ValidationIssueRowModel[];
  /**
   * The 查看 intent for a row. The list never navigates itself — the caller
   * decides whether an issue opens its Day, the Unscheduled surface or nothing.
   */
  onSelectIssue?: (issue: ValidationIssue) => void;
}

/**
 * Stage-03 §6.12 issue list: one ⚠ row per derived warning. Warnings never
 * block; the whole row is the affordance, with 查看 as the trailing hint.
 */
export function ValidationIssueList({
  rows,
  onSelectIssue,
}: ValidationIssueListProps) {
  if (rows.length === 0) return null;

  return (
    <View testID="validation-issue-list">
      {rows.map((row, index) => (
        <Pressable
          accessibilityRole={onSelectIssue ? 'button' : undefined}
          key={row.issue.id}
          onPress={onSelectIssue ? () => onSelectIssue(row.issue) : undefined}
          style={styles.row}
          testID={`validation-issue-row-${index}`}
        >
          <Text style={styles.marker}>⚠</Text>
          <View style={styles.textRegion}>
            <Text style={styles.title} numberOfLines={1}>
              {row.title}
            </Text>
            <Text style={styles.message} numberOfLines={1}>
              {row.message}
            </Text>
          </View>
          {onSelectIssue ? <Text style={styles.view}>查看</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    ...typography.body,
    color: colors.warning,
    marginRight: spacing.sm,
  },
  message: {
    ...typography.caption,
    color: colors.textSubtle,
    marginTop: 2,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 52,
    paddingVertical: spacing.sm,
  },
  textRegion: {
    flex: 1,
  },
  title: {
    ...typography.body,
    color: colors.text,
  },
  view: {
    ...typography.label,
    color: colors.primary,
    marginLeft: spacing.sm,
  },
});
