import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ConfirmMapPickerPlaceCommand } from '@/application/place/confirm-map-picker-place';
import type {
  ConfirmPlaceSearchResultCommand,
} from '@/application/place/confirm-place-search-result';
import type { Coordinate } from '@/domain/common/types';
import type { Place } from '@/domain/place/types';
import type { MapRenderer } from '@/infrastructure/map/map-renderer';
import type { PlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import type {
  PlaceSearchResult,
  ReverseGeocodeResult,
} from '@/infrastructure/place/place-provider';
import type { PlaceSelectionTarget } from '@/application/place/place-selection';
import { buildLegacyAppleQuery, legacyAppleSearchSuggestions } from '@/application/place/legacy-apple-query';
import type { PlaceSearchProps } from './place-search';
import { PlaceSearch } from './place-search';
import { AnimatedSheetModal } from './ui/animated-sheet-modal';
import { AppButton } from './ui/app-button';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '@/theme/tokens';

export interface LegacyApplePlaceSheetProps {
  places: readonly Place[];
  visible: boolean;
  onClose: () => void;
  onBindResult: (sourcePlaceId: string, result: PlaceSearchResult) => Promise<void>;
  session: PlaceProviderSession;
  mapRenderer: MapRenderer;
}

interface BindingAttempt {
  sourcePlaceId: string;
  result: PlaceSearchResult;
  generation: number;
}

const EMPTY_APPLE_COORDINATE: Coordinate = {
  latitude: 0,
  longitude: 0,
  system: 'wgs84',
};

/** This command is unreachable because `onSelectTarget` intercepts both paths. */
const unreachableSearchCommand: ConfirmPlaceSearchResultCommand = async () => {
  throw new Error('Legacy Apple Place selection must be handled by onSelectTarget.');
};

/** This command is unreachable because `onSelectTarget` intercepts the map pick. */
const unreachableMapPickerCommand: ConfirmMapPickerPlaceCommand = async () => {
  throw new Error('Legacy Apple Place selection must be handled by onSelectTarget.');
};

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function sameCoordinate(left: Coordinate, right: Coordinate): boolean {
  return left.system === right.system
    && left.latitude === right.latitude
    && left.longitude === right.longitude;
}

function resultFromTarget(target: PlaceSelectionTarget, fallbackName: string): PlaceSearchResult {
  if (target.kind === 'search') {
    if (target.result.provider !== 'apple' || target.result.coordinate.system !== 'wgs84') {
      throw new RangeError('只能确认苹果地图返回的 WGS84 地点。');
    }
    return target.result;
  }

  if (
    target.kind !== 'map-picker' ||
    target.provider !== 'apple' ||
    target.coordinate.system !== 'wgs84'
  ) {
    throw new RangeError('地图选点必须来自苹果地图的 WGS84 坐标。');
  }

  const enrichment: ReverseGeocodeResult | null = target.enrichment;
  if (
    enrichment !== null &&
    (
      enrichment.provider !== 'apple' ||
      enrichment.coordinate.system !== 'wgs84' ||
      !sameCoordinate(enrichment.coordinate, target.coordinate)
    )
  ) {
    throw new RangeError('地点解析结果与当前苹果地图坐标不一致。');
  }

  return {
    name: enrichment?.name?.trim() || fallbackName,
    address: enrichment?.address?.trim() || null,
    coordinate: {
      latitude: target.coordinate.latitude,
      longitude: target.coordinate.longitude,
      system: 'wgs84',
    },
    provider: 'apple',
    providerPlaceId: enrichment?.providerPlaceId?.trim() || null,
    regionLabel: enrichment?.regionLabel?.trim() || null,
    metadata: enrichment?.metadata ?? null,
  };
}

/** Reconcile a legacy Place by binding a fresh Apple snapshot without editing its Items. */
export function LegacyApplePlaceSheet({
  places,
  visible,
  onClose,
  onBindResult,
  session,
  mapRenderer,
}: LegacyApplePlaceSheetProps) {
  const insets = useSafeAreaInsets();
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [mapFallbackCoordinate, setMapFallbackCoordinate] = useState<Coordinate | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [isBinding, setIsBinding] = useState(false);
  const generationRef = useRef(0);
  const bindingGenerationRef = useRef<number | null>(null);
  const lastAttemptRef = useRef<BindingAttempt | null>(null);

  const openSearch = (place: Place) => {
    generationRef.current += 1;
    setSelectedPlace(place);
    setMapFallbackCoordinate(null);
    setBindingError(null);
    setSearchVisible(true);
  };

  const closeSearch = () => {
    generationRef.current += 1;
    setSearchVisible(false);
    setSelectedPlace(null);
    setMapFallbackCoordinate(null);
    setBindingError(null);
    setIsBinding(false);
    lastAttemptRef.current = null;
  };

  const bind = async (attempt: BindingAttempt) => {
    if (bindingGenerationRef.current === attempt.generation) return;
    bindingGenerationRef.current = attempt.generation;
    lastAttemptRef.current = attempt;
    setIsBinding(true);
    setBindingError(null);
    try {
      await onBindResult(attempt.sourcePlaceId, attempt.result);
      if (generationRef.current === attempt.generation) closeSearch();
    } catch (error: unknown) {
      if (generationRef.current === attempt.generation) {
        setBindingError(
          error instanceof Error ? error.message : '确认地点失败，请重试。',
        );
      }
    } finally {
      if (bindingGenerationRef.current === attempt.generation) {
        bindingGenerationRef.current = null;
      }
      if (generationRef.current === attempt.generation) setIsBinding(false);
    }
  };

  const handleSelection = (sourcePlace: Place, target: PlaceSelectionTarget) => {
    const generation = generationRef.current;
    try {
      const result = resultFromTarget(target, sourcePlace.name);
      void bind({ sourcePlaceId: sourcePlace.id, result, generation });
    } catch (error: unknown) {
      setBindingError(
        error instanceof Error ? error.message : '无法确认此地点，请重新选择。',
      );
    }
  };

  const retry = () => {
    const attempt = lastAttemptRef.current;
    if (attempt) void bind({ ...attempt, generation: generationRef.current });
  };

  const isAppleSession = session.providerId === 'apple'
    && session.coordinateSystem === 'wgs84'
    && session.automatic !== true;

  const selectionConfirmation = selectedPlace ? {
    command: unreachableSearchCommand,
    tripId: selectedPlace.id,
    dayId: null,
    onSelectTarget: (target: PlaceSelectionTarget) => handleSelection(selectedPlace, target),
  } as NonNullable<PlaceSearchProps['confirmation']> : undefined;

  const mapPickerConfirmation = selectedPlace ? {
    command: unreachableMapPickerCommand,
    tripId: selectedPlace.id,
    dayId: null,
    onSelectTarget: (target: PlaceSelectionTarget) => handleSelection(selectedPlace, target),
  } : undefined;

  return (
    <>
      <AnimatedSheetModal
        maxHeightRatio={0.8}
        onRequestClose={onClose}
        scrollable
        testID="legacy-apple-place-sheet"
        title="确认旧地点"
        visible={visible}
      >
        <View style={styles.list} testID="legacy-apple-place-list">
          {places.map((place) => (
            <Pressable
              accessibilityRole="button"
              key={place.id}
              onPress={() => openSearch(place)}
              style={({ pressed }) => [styles.placeRow, pressed ? styles.placeRowPressed : null]}
              testID={`legacy-apple-place-row-${place.id}`}
            >
              <Text style={styles.placeName}>{place.name}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </AnimatedSheetModal>

      {selectedPlace && searchVisible ? (
        <Modal
          animationType="slide"
          onRequestClose={closeSearch}
          presentationStyle="fullScreen"
          testID="legacy-apple-place-search-modal"
          visible
        >
          <View style={styles.searchScreen}>
            {isAppleSession ? (
              <PlaceSearch
                confirmation={selectionConfirmation}
                initialDate={localToday()}
                initialQuery={buildLegacyAppleQuery(selectedPlace)}
                emptySearchSuggestions={legacyAppleSearchSuggestions(selectedPlace)}
                selectionConfirmLabel="确认此地点"
                mapPicker={{
                  confirmation: mapPickerConfirmation,
                  initialCoordinate: mapFallbackCoordinate ?? EMPTY_APPLE_COORDINATE,
                  mapRenderer,
                  onUseCoordinate: () => undefined,
                }}
                onCancel={closeSearch}
                onOpenMapPicker={() => undefined}
                onResultPress={(result) => {
                  if (result.provider === 'apple' && result.coordinate.system === 'wgs84') {
                    setMapFallbackCoordinate(result.coordinate);
                  }
                }}
                session={session}
                title="确认旧地点"
              />
            ) : (
              <View style={styles.sessionError}>
                <Text accessibilityRole="alert" style={styles.errorText}>
                  苹果地图暂不可用，请返回后重试。
                </Text>
                <AppButton onPress={closeSearch} title="返回旧地点" variant="secondary" />
              </View>
            )}
            {bindingError ? (
              <View
                style={[styles.bindingFeedback, { bottom: Math.max(insets.bottom, spacing.md) }]}
                testID="legacy-apple-place-binding-error"
              >
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {bindingError}
                </Text>
                <AppButton
                  disabled={isBinding}
                  onPress={retry}
                  testID="legacy-apple-place-retry"
                  title={isBinding ? '正在确认…' : '重试确认'}
                  variant="secondary"
                />
              </View>
            ) : isBinding ? (
              <View
                style={[styles.bindingFeedback, { bottom: Math.max(insets.bottom, spacing.md) }]}
                testID="legacy-apple-place-binding-progress"
              >
                <Text accessibilityLiveRegion="polite" style={styles.progressText}>
                  正在确认地点…
                </Text>
              </View>
            ) : null}
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  bindingFeedback: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 4,
    gap: spacing.sm,
    left: spacing.lg,
    padding: spacing.md,
    position: 'absolute',
    right: spacing.lg,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  chevron: { color: colors.textDisabled, fontSize: 22, lineHeight: 24 },
  errorText: { ...typography.body, color: colors.danger, textAlign: 'center' },
  list: { gap: spacing.xs, paddingBottom: spacing.md },
  placeName: { ...typography.body, color: colors.text, flex: 1 },
  placeRow: {
    alignItems: 'center',
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
  },
  placeRowPressed: { opacity: 0.7 },
  progressText: { ...typography.body, color: colors.textSecondary },
  searchScreen: { backgroundColor: colors.surface, flex: 1 },
  sessionError: { alignItems: 'center', flex: 1, gap: spacing.lg, justifyContent: 'center', padding: spacing.xl },
});
