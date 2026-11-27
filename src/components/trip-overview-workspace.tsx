import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ValidationIssue } from '@/domain/validation';
import type { ChangeTripDateRangeCommand } from '@/application/trip/change-trip-date-range';
import { getMapPlaceName } from '@/application/projections/map-place';
import type { DeleteTripCommand } from '@/application/trip/delete-trip';
import type { DeleteTripDayCommand } from '@/application/trip/delete-trip-day';
import type { InsertTripDayCommand } from '@/application/trip/insert-trip-day';
import type { RenameTripCommand } from '@/application/trip/rename-trip';
import {
  buildTripOverviewProjection,
} from '@/application/projections/trip-overview';
import type { TripOverviewData } from '@/application/queries/trip-overview';
import { validateTrip } from '@/application/trip/validate-trip';
import {
  buildValidationIssueRows,
} from '@/application/trip/validation-issue-presentation';
import type { EntityId } from '@/domain/common/types';
import type { Trip } from '@/domain/trip/types';
import type { MapRenderer } from '@/infrastructure/map/map-renderer';
import type { MapCameraRequest, MapMarkerModel } from '@/infrastructure/map/map-models';
import { markerProjectionKey } from '@/infrastructure/map/marker-clustering';
import { resolveTripMapStack } from '@/infrastructure/map/map-provider-policy';
import { useMapViewportPadding } from '@/infrastructure/map/map-viewport-insets';
import { useTripEntry } from '@/state/day-selection';
import { useTripFocus } from '@/state/trip-focus';
import { TripBottomSheet } from './trip-bottom-sheet';
import { TripBackButton, useBackSwipeGesture } from './trip-back-button';
import { TripDateManagement } from './trip-date-management';
import { TripOverviewPlacePreview } from './trip-overview-place-preview';
import { TripOverviewSheet } from './trip-overview-sheet';
import { TripManagementSheet } from './trip-management-sheet';
import { AppToast } from './ui/app-toast';

/** MapPlace's local WGS84 display projection must not cross the fixed Trip CRS. */
function sourceCoordinateOverviewData(data: TripOverviewData): TripOverviewData {
  if (data.mapPlacesById === undefined) return data;
  const mapPlacesById = Object.fromEntries(
    Object.entries(data.mapPlacesById).map(([sourcePlaceId, place]) => [
      sourcePlaceId,
      Object.fromEntries(
        Object.entries(place).filter(([key]) => key !== 'displayCoordinate'),
      ) as TripOverviewData['placesById'][EntityId],
    ]),
  ) as NonNullable<TripOverviewData['mapPlacesById']>;
  return { ...data, mapPlacesById };
}

export interface TripOverviewWorkspaceProps {
  data: TripOverviewData;
  mapRenderer: MapRenderer;
  /** M5-T7 will turn this marker intent into occurrence Preview. */
  onMarkerPress?: (markerId: EntityId) => void;
  onHome?: () => void;
  /**
   * Day-entry intent. The production shell supplies the shared transition
   * controller so Overview never bypasses destination readiness.
   */
  onSelectDay?: (dayId: EntityId) => void;
  /** Shared presentation transition owner; see `TripBackButton`. */
  onBack?: () => void;
  /** Absent means the Trip's dates are not editable in this build. */
  changeTripDateRange?: ChangeTripDateRangeCommand;
  insertTripDay?: InsertTripDayCommand;
  deleteTripDay?: DeleteTripDayCommand;
  /** Optional command seams; the management sheet has production defaults. */
  renameTripCommand?: RenameTripCommand;
  deleteTripCommand?: DeleteTripCommand;
  /** Fired after a successful write; the caller invalidates its read models. */
  onDateRangeChanged?: () => void;
  /** Fired after Trip metadata writes commit. */
  onTripRenamed?: (trip: Trip) => void;
  onTripDeleted?: (tripId: EntityId) => void;
}

/** Trip-wide map plus the primary Day List in one Half-default planning shell. */
export function TripOverviewWorkspace({
  data,
  mapRenderer: MapRendererComponent,
  onMarkerPress,
  onHome,
  onSelectDay,
  onBack,
  changeTripDateRange,
  insertTripDay,
  deleteTripDay,
  renameTripCommand,
  deleteTripCommand,
  onDateRangeChanged,
  onTripRenamed,
  onTripDeleted,
}: TripOverviewWorkspaceProps) {
  useTripEntry(data.trip.id);
  const insets = useSafeAreaInsets();
  const stack = resolveTripMapStack(data.trip);
  const mapData = sourceCoordinateOverviewData(data);
  const projection = buildTripOverviewProjection(mapData);
  const mapSystem = stack.coordinateSystem;
  const sheetSnap = useTripFocus((state) => state.sheetSnap);
  const setSheetSnap = useTripFocus((state) => state.setSheetSnap);
  const cameraPadding = useMapViewportPadding(sheetSnap);
  const selectDayFromStore = useTripFocus((state) => state.selectDay);
  const selectDay = onSelectDay ?? selectDayFromStore;
  const openUnscheduled = useTripFocus((state) => state.openUnscheduled);
  /**
   * Stage-03 §6.12 Trip-level validation summary: derived from the same read
   * model the sheet already renders, so it refreshes with the Overview.
   */
  const validationRows = useMemo(() => {
    const items = [...data.scheduledItems, ...data.unscheduledItems];
    return buildValidationIssueRows(
      validateTrip({ trip: data.trip, items }),
      new Map(items.map((item) => [item.id, item])),
    );
  }, [data]);
  const handleSelectIssue = (issue: ValidationIssue) => {
    const item = issue.itemId === null ? undefined
      : [...data.scheduledItems, ...data.unscheduledItems]
        .find(({ id }) => id === issue.itemId);
    if (item?.dayId !== null && item?.dayId !== undefined) {
      selectDay(item.dayId);
    } else {
      openUnscheduled();
    }
  };
  // Unscheduled locations remain in their own surface instead of a gray pin code.
  const [previewMarkerIds, setPreviewMarkerIds] = useState<string[]>([]);
  const sourceKey = markerProjectionKey(projection.markers);
  const [clusterCamera, setClusterCamera] = useState<{ sourceKey: string; request: MapCameraRequest } | null>(null);
  const clusterRequestId = useRef(0);
  const lastExpandedCluster = useRef<string | null>(null);
  const visibleMarkers = projection.markers.map(marker => previewMarkerIds.includes(marker.id)
    ? { ...marker, variant: 'selected' as const }
    : marker);
  const cameraBase = clusterCamera?.sourceKey === sourceKey ? clusterCamera.request : projection.cameraRequest;
  const cameraRequest = cameraBase ? { ...cameraBase, padding: cameraPadding } : null;
  const [isDateSheetVisible, setIsDateSheetVisible] = useState(false);
  const [isTripManagementVisible, setIsTripManagementVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** UX-C: right-swipe on the sheet's fixed handle strip goes Back. */
  const backSwipeGesture = useBackSwipeGesture(onBack);
  const canEditDates =
    changeTripDateRange !== undefined
    || insertTripDay !== undefined
    || deleteTripDay !== undefined;
  const previewMarkers = projection.markers.filter(({ id }) => previewMarkerIds.includes(id));
  const previewItemIds = [...new Set(previewMarkers.flatMap(marker => marker.sourceItemIds ?? [marker.id]))];
  const previewOccurrences = previewItemIds.flatMap((itemId) => {
    const item = data.scheduledItems.find((candidate) => candidate.id === itemId);
    const day = item?.dayId === null || item?.dayId === undefined
      ? undefined
      : data.days.find((candidate) => candidate.id === item.dayId);
    const place = item?.placeId ? (mapData.mapPlacesById ?? mapData.placesById)[item.placeId] : undefined;
    return item && day ? [{ item, day, placeName: place ? getMapPlaceName(place) : item.title }] : [];
  }).sort((a, b) => a.day.dayIndex - b.day.dayIndex || a.item.sortOrder - b.item.sortOrder);
  const previewPlaceIds = new Set(previewMarkers.flatMap(marker => marker.placeIds ?? []));
  const previewPlaceName = previewOccurrences[0]
    ? previewPlaceIds.size > 1 ? `${previewPlaceIds.size} 个地点` : (() => {
      const place = (mapData.mapPlacesById ?? mapData.placesById)[previewOccurrences[0].item.placeId!];
      return place ? getMapPlaceName(place) : '地点';
    })()
    : '';
  const handleMarkerPress = (markerId: EntityId) => {
    onMarkerPress?.(markerId);
    setPreviewMarkerIds([markerId]);
  };
  const handleClusterPress = (members: readonly MapMarkerModel[]) => {
    const ids = members.map(marker => marker.id).sort();
    const key = `${data.trip.id}:${sourceKey}:${ids.join('|')}`;
    const coordinates = [...new Map(members.map(marker => [
      `${marker.coordinate.system}:${marker.coordinate.latitude}:${marker.coordinate.longitude}`,
      marker.coordinate,
    ])).values()];
    // A second press after an unsuccessful fit opens the source list instead of
    // sending the same camera fit forever (e.g. co-located points or max zoom).
    if (coordinates.length > 1 && lastExpandedCluster.current !== key) {
      lastExpandedCluster.current = key;
      clusterRequestId.current += 1;
      setPreviewMarkerIds([]);
      setClusterCamera({ sourceKey, request: {
        coordinates, requestId: clusterRequestId.current, scopeKey: `overview-cluster:${key}`,
      } });
    } else setPreviewMarkerIds(ids);
  };

  return (
    <View style={styles.container} testID="trip-overview-workspace">
      <TripBackButton onBack={onBack} onHome={onHome} testID="trip-overview-back" />
      <View style={styles.map} testID="trip-overview-map">
        <MapRendererComponent
          cameraRequest={cameraRequest}
          clusterMarkers
          markers={visibleMarkers}
          onMarkerPress={handleMarkerPress}
          onClusterPress={handleClusterPress}
          onMapInteraction={() => { lastExpandedCluster.current = null; }}
          system={mapSystem}
        />
      </View>
      <TripBottomSheet
        handleGesture={backSwipeGesture ?? undefined}
        onSnapChange={setSheetSnap}
        scrollable
        snap={sheetSnap}
      >
        <TripOverviewSheet
          onEditDateRange={canEditDates ? () => setIsDateSheetVisible(true) : undefined}
          onManageTrip={() => setIsTripManagementVisible(true)}
          onOpenUnscheduled={openUnscheduled}
          onSelectDay={selectDay}
          projection={projection}
          tripTitle={data.trip.title}
          validationRows={validationRows}
          onSelectIssue={handleSelectIssue}
        />
      </TripBottomSheet>
      {/*
       * Rendered even while closed: the sheet owns its own entrance and exit
       * motion, so it has to stay mounted for the backdrop to fade rather than
       * appear with the white card.
       */}
      <TripOverviewPlacePreview
        onClose={() => setPreviewMarkerIds([])}
        onSelectDay={selectDay}
        occurrences={previewOccurrences}
        placeName={previewPlaceName}
        resetKey={previewMarkerIds.join('|')}
        visible={previewMarkers.length > 0 && previewOccurrences.length > 0}
      />
      {canEditDates ? (
        <TripDateManagement
          changeTripDateRange={changeTripDateRange}
          days={data.days}
          deleteTripDay={deleteTripDay}
          endDate={data.trip.endDate}
          insertTripDay={insertTripDay}
          onChanged={() => onDateRangeChanged?.()}
          onClose={() => setIsDateSheetVisible(false)}
          onCompleted={setToast}
          scheduledItems={data.scheduledItems}
          startDate={data.trip.startDate}
          tripId={data.trip.id}
          visible={isDateSheetVisible}
        />
      ) : null}
      <TripManagementSheet
        deleteTripCommand={deleteTripCommand}
        onClose={() => setIsTripManagementVisible(false)}
        onTripDeleted={onTripDeleted}
        onTripRenamed={onTripRenamed}
        renameTripCommand={renameTripCommand}
        trip={data.trip}
        visible={isTripManagementVisible}
      />
      {/*
       * Feedback sits in the same slot as the shell's navigation error banner,
       * so a completed date change is confirmed without a blocking Alert.
       */}
      <AppToast
        message={toast}
        onDismiss={() => setToast(null)}
        topOffset={insets.top + 56}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
});
