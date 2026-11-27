import { StyleSheet } from 'react-native';

import { colors, spacing, typography } from '@/theme/tokens';

/**
 * Shared page chrome for the Trip date sheet's sub-pages.
 *
 * The three date pages show the same two things — the current range and the
 * range that would result — so they share one summary treatment instead of each
 * inventing its own spacing and weight.
 */
export const tripDatePageStyles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm },
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  /** The page body must own the remaining height, not grow past the sheet. */
  page: { flex: 1 },
  error: { color: colors.danger, fontSize: 14 },
  hint: { ...typography.caption, color: colors.textSubtle },
  impact: { gap: 2, paddingTop: spacing.sm },
  impactLine: { ...typography.caption, color: colors.textMuted },
  label: { ...typography.label, color: colors.textSecondary, paddingTop: spacing.xs },
  preview: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
    paddingTop: spacing.md,
  },
  previewNote: {
    ...typography.caption,
    color: colors.textMuted,
    paddingTop: spacing.xs,
  },
  readout: {
    alignItems: 'center',
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  readoutLabel: { ...typography.label, color: colors.textSecondary },
  readoutValue: { ...typography.body, color: colors.text, fontWeight: '600' },
  readoutValueActive: { color: colors.primary },
  readouts: { marginTop: spacing.xs },
  summary: { gap: 2 },
  summaryCount: { ...typography.body, color: colors.textSubtle },
  summaryLabel: { ...typography.label, color: colors.textSubtle },
  summaryRange: { ...typography.cardTitle, color: colors.text },
});
