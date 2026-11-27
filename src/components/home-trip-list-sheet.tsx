import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { EntityId } from '@/domain/common/types';
import type {
  HomeTripFilter,
  HomeTripSummary,
} from '@/application/projections/home-map';
import type { HomeRecap } from '@/application/projections/home-recap';
import { colors } from '@/theme/tokens';
import { HomeCreateTripFab } from './home-create-trip-fab';
import { HomeRecapLine } from './home-recap-line';
import { HomeTripFilterControl } from './home-trip-filter-control';
import { HomeYearFilterControl } from './home-year-filter-control';
import { formatRangeZh } from './trip-date-labels';

/**
 * M10-T6 — the 我的旅行 Trip-list Bottom Sheet's content.
 *
 * Stage-03 §3.2 makes this the "direct list alternative for users who do not
 * want to navigate by markers". UX-B (2026-10-04) sharpens that for rows: a
 * tap opens the Trip Overview outright, so the list is one step, not a select
 * plus a preview. Map markers keep the §3.6 select-first flow through the
 * preview card; only rows were shortened.
 *
 * The rows are `projection.visibleTrips`, not a re-filtered copy: the filter rule
 * lives in `buildHomeMapProjection`, so the list and the markers cannot
 * drift apart.
 */

export interface HomeTripListSheetProps {
  trips: readonly HomeTripSummary[];
  /**
   * True only when the whole Footprint is empty. A filter that hides everything
   * is not a first use, so it keeps the filter and the compact create button.
   */
  isFirstUse?: boolean;
  filter: HomeTripFilter;
  onFilterChange: (filter: HomeTripFilter) => void;
  /**
   * The year refinement under the lifecycle filter. It needs both the years on
   * offer and a handler; without either, no year row is drawn.
   */
  availableYears?: readonly number[];
  year?: number | null;
  onYearChange?: (year: number | null) => void;
  /** The count line for `trips`; absent means no summary is drawn. */
  recap?: HomeRecap;
  /** Opens the row's Trip Overview outright; absent means rows are inert. */
  onOpenTrip?: (tripId: EntityId) => void;
  /** Opens the shared Trip metadata sheet for one row. */
  onManageTrip?: (tripId: EntityId) => void;
  /** Absent means this build cannot create a Trip — no seam, no action. */
  onCreateTrip?: () => void;
  onImportTrip?: () => void;
}

const LIFECYCLE_LABELS: Record<HomeTripSummary['lifecycle'], string> = {
  active: '旅行中',
  completed: '已完成',
  planned: '计划中',
};

export function HomeTripListSheet({
  trips,
  filter,
  onFilterChange,
  availableYears,
  year = null,
  onYearChange,
  recap,
  onOpenTrip,
  onManageTrip,
  onCreateTrip,
  onImportTrip,
  isFirstUse = false,
}: HomeTripListSheetProps) {
  return (
    <View style={styles.container} testID="home-trip-list-sheet">
      <View style={styles.heading}>
        <Text style={styles.title}>我的旅行</Text>
        <Text style={styles.count} testID="home-trip-list-count">{trips.length}</Text>
        {/* §3.2 puts the create affordance at the end of this row. */}
        {onCreateTrip && !isFirstUse ? (
          <View style={styles.create}>
            <HomeCreateTripFab onPress={onCreateTrip} />
          </View>
        ) : null}
      </View>

      {onImportTrip&&<Pressable accessibilityRole="button" accessibilityLabel="导入旅行文件" onPress={onImportTrip} style={{paddingVertical:8}}><Text style={{color:colors.primary,fontSize:14}}>导入旅行文件</Text></Pressable>}

      {isFirstUse ? (
        /* Stage-03 §3.7: with no Trips at all the affordance is the whole state. */
        <View style={styles.firstUse}>
          <Text style={styles.firstUseTitle} testID="home-trip-list-first-use">还没有旅行</Text>
          <Text style={styles.firstUseBody}>从第一段旅程开始 记录你的旅行地图</Text>
          {onCreateTrip ? (
            <HomeCreateTripFab label="+ 新建旅行" onPress={onCreateTrip} />
          ) : null}
        </View>
      ) : (
        <>
          <HomeTripFilterControl onChange={onFilterChange} value={filter} />
          {availableYears && onYearChange ? (
            <HomeYearFilterControl onChange={onYearChange} value={year} years={availableYears} />
          ) : null}
          {recap ? <HomeRecapLine recap={recap} /> : null}
          {trips.length === 0 ? (
            <Text style={styles.empty} testID="home-trip-list-empty">这里还没有旅行</Text>
          ) : (
        <View style={styles.rows}>
          {trips.map((trip) => {
            const body = (
              <View style={styles.rowBody}>
                <Text numberOfLines={1} style={styles.rowTitle}>{trip.title}</Text>
                <Text numberOfLines={Platform.OS === 'web' ? 2 : 1} style={styles.rowMeta}>
                  {`${formatRangeZh(trip.startDate, trip.endDate)}${Platform.OS === 'web' ? '\n' : ' · '}${trip.dayCount} 天 · ${trip.placeCount} 个地点 · ${LIFECYCLE_LABELS[trip.lifecycle]}`}
                </Text>
              </View>
            );
            const manage = onManageTrip ? (
              <Pressable
                accessibilityLabel={`管理旅行 ${trip.title}`}
                accessibilityHint="打开旅行管理选项"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => onManageTrip(trip.tripId)}
                style={styles.manage}
                testID={`home-trip-manage-${trip.tripId}`}
              >
                <Text style={styles.manageLabel}>⋯</Text>
              </Pressable>
            ) : null;
            return (
              <View key={trip.tripId} style={styles.row}>
                {onOpenTrip ? (
                  <Pressable
                    accessibilityLabel={`打开旅行 ${trip.title}`}
                    accessibilityHint="打开旅行概览"
                    accessibilityRole="button"
                    onPress={() => onOpenTrip(trip.tripId)}
                    style={styles.rowOpen}
                    testID={`home-trip-row-${trip.tripId}`}
                  >
                    {body}
                  </Pressable>
                ) : (
                  <View
                    style={styles.rowOpen}
                    testID={`home-trip-row-${trip.tripId}`}
                  >
                    {body}
                  </View>
                )}
                {manage}
              </View>
            );
          })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  count: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  create: { marginLeft: 'auto' },
  empty: { color: colors.textMuted, fontSize: 14, paddingVertical: 12 },
  firstUse: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  firstUseBody: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  firstUseTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  heading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 2,
    paddingVertical: 10,
  },
  rowOpen: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 2, minHeight: 44 },
  rowBody: { flex: 1, gap: 2 },
  rowMeta: { color: colors.textMuted, fontSize: 12 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rows: { gap: 2 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  manage: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  manageLabel: { color: colors.textMuted, fontSize: 24, lineHeight: 26 },
});
