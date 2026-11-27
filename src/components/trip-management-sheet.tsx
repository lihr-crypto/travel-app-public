import { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { EntityId } from '@/domain/common/types';
import type { DeleteTripCommand } from '@/application/trip/delete-trip';
import type { RenameTripCommand } from '@/application/trip/rename-trip';
import type { Trip } from '@/domain/trip/types';
import {
  deleteTripCommand as defaultDeleteTripCommand,
  renameTripCommand as defaultRenameTripCommand,
} from '@/infrastructure/database/trip-command';
import { colors, MIN_TOUCH_TARGET, radius, spacing, typography } from '@/theme/tokens';
import { AnimatedSheetModal } from './ui/animated-sheet-modal';

type TripManagementPage = 'menu' | 'rename' | 'delete';

export interface TripManagementSheetProps {
  trip: Trip;
  visible: boolean;
  onClose: () => void;
  /** Optional seams keep the sheet easy to exercise without touching SQLite. */
  renameTripCommand?: RenameTripCommand;
  deleteTripCommand?: DeleteTripCommand;
  /** Called only after the corresponding command commits successfully. */
  onTripRenamed?: (trip: Trip) => void;
  onTripDeleted?: (tripId: EntityId) => void;
}

function errorMessage(error: unknown, operation: 'delete' | 'rename') {
  if (error instanceof Error) {
    if (error.message.includes('must not be empty')) return '旅行名称不能为空';
    if (error.message.startsWith('Trip not found')) return '这趟旅行已不存在，请返回刷新。';
  }
  return operation === 'rename'
    ? '旅行名称保存失败，请重试。'
    : '旅行删除失败，请重试。';
}

/**
 * Shared Trip metadata sheet used from Home rows and the Trip Overview heading.
 * The destructive path is deliberately a second page with an explicit action;
 * opening the overflow menu can never mutate the database.
 */
export function TripManagementSheet({
  trip,
  visible,
  onClose,
  renameTripCommand = defaultRenameTripCommand,
  deleteTripCommand = defaultDeleteTripCommand,
  onTripRenamed,
  onTripDeleted,
}: TripManagementSheetProps) {
  const [page, setPage] = useState<TripManagementPage>('menu');
  const [titleDraft, setTitleDraft] = useState(trip.title);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const [lastVisibilityKey, setLastVisibilityKey] = useState('');
  const visibilityKey = `${trip.id}:${visible ? 'open' : 'closed'}`;
  if (visibilityKey !== lastVisibilityKey) {
    setLastVisibilityKey(visibilityKey);
    if (visible) {
      setPage('menu');
      setTitleDraft(trip.title);
      setError(null);
      setIsSaving(false);
    }
  }

  const saveRename = async () => {
    if (saving.current) return;
    const title = titleDraft.trim();
    if (!title) {
      setError('旅行名称不能为空');
      return;
    }

    setError(null);
    saving.current = true;
    setIsSaving(true);
    let result;
    try {
      result = await renameTripCommand({ tripId: trip.id, title });
    } catch (cause) {
      saving.current = false;
      setIsSaving(false);
      setError(errorMessage(cause, 'rename'));
      return;
    }
    saving.current = false;
    setIsSaving(false);
    onClose();
    onTripRenamed?.(result.data);
  };

  const confirmDelete = async () => {
    if (saving.current) return;
    setError(null);
    saving.current = true;
    setIsSaving(true);
    try {
      await deleteTripCommand({ tripId: trip.id });
    } catch (cause) {
      saving.current = false;
      setIsSaving(false);
      setError(errorMessage(cause, 'delete'));
      return;
    }
    saving.current = false;
    setIsSaving(false);
    onClose();
    onTripDeleted?.(trip.id);
  };

  const sheetTitle = page === 'menu'
    ? '管理旅行'
    : page === 'rename'
      ? '修改旅行名称'
      : '删除整趟旅行';

  return (
    <AnimatedSheetModal
      onRequestClose={() => { if (!saving.current) onClose(); }}
      resetKey={`${trip.id}:${page}`}
      avoidKeyboard
      scrollable
      testID="trip-management-sheet"
      title={sheetTitle}
      visible={visible}
    >
      {page === 'menu' ? (
        <View testID="trip-management-menu">
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setPage('rename');
            }}
            style={styles.row}
            testID="trip-management-rename"
          >
            <Text style={styles.rowLabel}>修改旅行名称</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setPage('delete');
            }}
            style={[styles.row, styles.dangerRow]}
            testID="trip-management-delete"
          >
            <Text style={styles.dangerLabel}>删除整趟旅行</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>
      ) : null}

      {page === 'rename' ? (
        <View style={styles.page} testID="trip-management-rename-page">
          <Text style={styles.label}>旅行名称</Text>
          <TextInput
            autoFocus
            onChangeText={(value) => {
              setTitleDraft(value);
              if (error) setError(null);
            }}
            onSubmitEditing={() => { void saveRename(); }}
            placeholder="例如：关西秋日旅行"
            returnKeyType="done"
            style={styles.input}
            testID="trip-management-title-input"
            value={titleDraft}
          />
          {error ? <Text style={styles.error} testID="trip-management-error">{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={onClose}
              style={styles.secondaryAction}
              testID="trip-management-rename-cancel"
            >
              <Text style={styles.secondaryActionLabel}>取消</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={() => { void saveRename(); }}
              style={[styles.primaryAction, isSaving ? styles.disabledAction : null]}
              testID="trip-management-rename-save"
            >
              <Text style={styles.primaryActionLabel}>{isSaving ? '保存中…' : '保存'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {page === 'delete' ? (
        <View style={styles.page} testID="trip-management-delete-page">
          <Text style={styles.confirmTitle}>{`确定删除「${trip.title}」吗？`}</Text>
          <Text style={styles.confirmBody}>
            将永久删除这趟旅行的全部 Day、已安排行程和未安排行程，删除后无法恢复。
          </Text>
          {error ? <Text style={styles.error} testID="trip-management-error">{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={onClose}
              style={styles.secondaryAction}
              testID="trip-management-delete-cancel"
            >
              <Text style={styles.secondaryActionLabel}>取消</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={() => { void confirmDelete(); }}
              style={[styles.dangerAction, isSaving ? styles.disabledAction : null]}
              testID="trip-management-delete-confirm"
            >
              <Text style={styles.primaryActionLabel}>{isSaving ? '删除中…' : '确认删除'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </AnimatedSheetModal>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.lg },
  chevron: { color: colors.textSubtle, fontSize: 20 },
  confirmBody: { ...typography.body, color: colors.textMuted, lineHeight: 24, paddingTop: spacing.sm },
  confirmTitle: { ...typography.sectionTitle, color: colors.text },
  dangerAction: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
  },
  dangerLabel: { ...typography.body, color: colors.danger, fontWeight: '600' },
  dangerRow: { borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.xs },
  disabledAction: { opacity: 0.55 },
  error: { ...typography.caption, color: colors.danger, paddingTop: spacing.sm },
  input: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  label: { ...typography.label, color: colors.textSubtle, paddingBottom: spacing.sm },
  page: { gap: spacing.sm },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
  },
  primaryActionLabel: { ...typography.body, color: colors.onPrimary, fontWeight: '600' },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: spacing.sm,
  },
  rowLabel: { ...typography.body, color: colors.text },
  secondaryAction: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
  },
  secondaryActionLabel: { ...typography.body, color: colors.primary, fontWeight: '600' },
});
