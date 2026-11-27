import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/tokens';

import type { ValidationIssue } from '@/domain/validation';
import type { ValidationIssueRowModel } from '@/application/trip/validation-issue-presentation';
import { ValidationIssueList } from './validation-issue-list';

export interface ValidationSummaryProps {
  rows: readonly ValidationIssueRowModel[];
  /** Passed through to the issue list's 查看 intent. */
  onSelectIssue?: (issue: ValidationIssue) => void;
}

/**
 * Stage-03 §6.12 Trip-level summary: `⚠ N 个行程需要确认` over a collapsible
 * issue list. Renders nothing while the Trip has no derived warnings, and
 * warns only — none of this blocks a valid save.
 */
export function ValidationSummary({ rows, onSelectIssue }: ValidationSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) return null;

  return (
    <View style={styles.container} testID="validation-summary">
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((value) => !value)}
        style={styles.summaryRow}
        testID="validation-summary-toggle"
      >
        <Text style={styles.marker}>⚠</Text>
        <Text style={styles.summaryText}>
          {`${rows.length} 个行程需要确认`}
        </Text>
        <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
      </Pressable>
      {expanded ? (
        <ValidationIssueList onSelectIssue={onSelectIssue} rows={rows} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chevron: {
    ...typography.body,
    color: colors.textSubtle,
  },
  container: {
    marginBottom: spacing.xs,
  },
  marker: {
    ...typography.body,
    color: colors.warning,
    marginRight: spacing.sm,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  summaryText: {
    ...typography.label,
    color: colors.text,
    flex: 1,
  },
});
