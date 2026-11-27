import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  useUnscheduledItems,
  type UnscheduledQuerySource,
} from '@/application/queries/unscheduled';
import type { EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import { colors } from '@/theme/tokens';
import { glog } from './gesture-debug';
import { EmptyHint } from './ui/empty-hint';

export interface UnscheduledItemListProps {
  tripId: EntityId;
  source: UnscheduledQuerySource;
  /** Opens the ⋯ action sheet for the row. Absent keeps rows read-only. */
  onRequestActions?: (item: Item) => void;
}

/**
 * UX-C: one ⋯ per row — the same compact control the Day rows use. The sheet
 * (编辑详情 / 安排到日期 / 删除) is owned by the workspace; the row only
 * reports the intent.
 */
export function UnscheduledItemList({
  tripId,
  source,
  onRequestActions,
}: UnscheduledItemListProps) {
  const query = useUnscheduledItems(source, tripId);

  return (
    <View style={styles.container} testID={`unscheduled-list-${tripId}`}>
      <Text style={styles.heading}>
        未安排 · {query.data?.length ?? 0}
      </Text>
      {query.isPending ? (
        <Text testID="unscheduled-loading">未安排行程加载中…</Text>
      ) : query.error ? (
        <Text style={styles.error} testID="unscheduled-error">
          {query.error.message}
        </Text>
      ) : query.data.length === 0 ? (
        <EmptyHint
          hint="在日程页点行程的 ⋯ → 修改日期，可以把行程移到这里"
          testID="unscheduled-empty"
          title="没有待安排的行程"
        />
      ) : (
        query.data.map((item) => (
          <View key={item.id} style={styles.row} testID={`unscheduled-item-${item.id}`}>
            <Text style={styles.dot}>●</Text>
            <Text style={styles.title}>{item.title}</Text>
            {onRequestActions ? (
              <Pressable
                accessibilityLabel={`${item.title} 的操作`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  glog(`u-actions-tap ${item.id}`);
                  onRequestActions(item);
                }}
                style={styles.actionsButton}
                testID={`unscheduled-actions-${item.id}`}
              >
                <Text style={styles.actionsLabel}>⋯</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actionsButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  actionsLabel: {
    color: colors.textMuted,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  container: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  dot: {
    color: colors.textSubtle,
  },
  empty: {
    color: colors.textSubtle,
  },
  error: {
    color: colors.danger,
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  title: {
    flex: 1,
    fontSize: 15,
  },
});
