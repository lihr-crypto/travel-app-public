import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { PlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import type {
  ConfirmedPlaceItem,
  ConfirmPlaceSearchResultCommand,
} from '@/application/place/confirm-place-search-result';
import type { ConfirmMapPickerPlaceCommand } from '@/application/place/confirm-map-picker-place';
import type { PlaceSelectionTarget } from '@/application/place/place-selection';
import type { Coordinate, EntityId } from '@/domain/common/types';
import type { ItemDraft } from '@/application/item/item-draft';
import type { ItemType } from '@/domain/item/types';
import type { MapRenderer } from '@/infrastructure/map/map-renderer';
import { MapPicker, type MapPickerSelection } from './map-picker';
import {
  PlaceProviderError,
  type PlaceSearchQuery,
  type PlaceSearchResult,
  type PlaceProviderId,
} from '@/infrastructure/place/place-provider';
import { PlacePreview, PlacePreviewContent } from './place-preview';
import { formatDateZhWeekday } from './trip-date-labels';
import { ItemDraftForm } from './item-draft-form';
import { ProviderAttributions } from './provider-attributions';
import { GoogleMapsAttribution } from './google-maps-attribution';
import { AppButton } from './ui/app-button';
import { colors, MIN_TOUCH_TARGET, radius, spacing, typography } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyHint } from './ui/empty-hint';

export interface PlaceSearchProps {
  /** Caller-owned legacy confirmation uses a task-specific selection label. */
  selectionConfirmLabel?: string;
  session: PlaceProviderSession;
  onOpenMapPicker: () => void;
  onResultPress?: (result: PlaceSearchResult) => void;
  /**
   * Page title. Adding a Place to a new Item and replacing an existing Item's
   * Place are different tasks, so the page names the one the user is in.
   */
  title?: string;
  confirmation?: {
    command: ConfirmPlaceSearchResultCommand;
    tripId: EntityId;
    dayId: EntityId | null;
    itemType?: ItemType;
    /**
     * Commit the picked Place immediately instead of opening the Item Draft
     * form first. Used when the caller is attaching a Place to an Item that
     * already exists and has its own title/type/time: re-asking for them would
     * invite the user to edit fields the flow will not save.
     */
    pickOnly?: boolean;
    /**
     * Hand the selection back to the caller instead of committing it. The Item
     * editor uses this so the location stays part of its own draft until 保存.
     */
    onSelectTarget?: (target: PlaceSelectionTarget) => void;
    onConfirmed?: (value: ConfirmedPlaceItem) => void;
  };
  onCancel?: () => void;
  /** Drops the current Place association; rendered only when provided. */
  onClearPlace?: () => void;
  /** Provider-aware handoff offered from the preview page. */
  onOpenInExternalMap?: (result: PlaceSearchResult) => Promise<unknown> | unknown;
  initialDate?: string;
  targetDayIndex?: number;
  initialQuery?: Partial<Pick<PlaceSearchQuery, 'keyword' | 'center' | 'region' | 'limit'>>;
  /** Caller-owned alternatives shown only after a successful empty search. */
  emptySearchSuggestions?: readonly string[];
  mapPicker?: {
    mapRenderer: MapRenderer;
    initialCoordinate: Coordinate;
    onUseCoordinate: (selection: MapPickerSelection) => void;
    onCoordinateChange?: (coordinate: Coordinate) => void;
    /**
     * Optional: when supplied, the crosshair selection opens the shared Item
     * Draft form; Save creates the Place and Item through one command.
     */
    confirmation?: {
      command: ConfirmMapPickerPlaceCommand;
      tripId: EntityId;
      dayId: EntityId | null;
      itemType?: ItemType;
      /** See `confirmation.pickOnly`. */
      pickOnly?: boolean;
      /** See `confirmation.onSelectTarget`. */
      onSelectTarget?: (target: PlaceSelectionTarget) => void;
      onConfirmed?: (value: ConfirmedPlaceItem) => void;
    };
  };
}

type PendingPlaceDraft =
  | Readonly<{ kind: 'search'; result: PlaceSearchResult }>
  | Readonly<{ kind: 'map-picker'; selection: MapPickerSelection }>;

const providerLabels = {
  apple: '苹果地图',
  amap: '高德地图',
  google: 'Google Maps',
} as const;

function errorMessage(error: unknown): string {
  if (error instanceof PlaceProviderError) {
    switch (error.code) {
      case 'invalid_query':
        return '请输入地点名称后再搜索。';
      case 'not_configured':
        return '地点服务暂不可用，请检查地图配置。';
      case 'invalid_response':
        return '地点服务返回了无效结果，请换个关键词重试。';
      case 'provider_error':
        return '地点搜索暂时不可用，请稍后重试。';
      case 'rate_limited':
        return '搜索请求较多，请稍候再试。';
    }
  }
  return error instanceof Error ? error.message : '地点搜索暂时不可用，请稍后重试。';
}

function resultKey(result: PlaceSearchResult, index: number): string {
  return `${result.provider}:` + (result.providerPlaceId
    ?? `${result.coordinate.latitude}:${result.coordinate.longitude}:${index}`);
}

function resultIdentity(result: PlaceSearchResult): string {
  return `${result.provider}:` + (result.providerPlaceId
    ?? `${result.coordinate.latitude}:${result.coordinate.longitude}`);
}

export function PlaceSearch({
  selectionConfirmLabel,
  session,
  onOpenMapPicker,
  onResultPress,
  title = '添加行程',
  confirmation,
  onCancel,
  onClearPlace,
  onOpenInExternalMap,
  initialQuery,
  emptySearchSuggestions,
  initialDate,
  targetDayIndex,
  mapPicker,
}: PlaceSearchProps) {
  const insets = useSafeAreaInsets();
  const [keyword, setKeyword] = useState(initialQuery?.keyword ?? '');
  const [searchCity, setSearchCity] = useState(initialQuery?.region?.city?.trim() ?? '');
  const [cityInput, setCityInput] = useState(searchCity);
  const [useMapCenter, setUseMapCenter] = useState(Boolean(initialQuery?.center));
  const [isCityEditing, setIsCityEditing] = useState(false);
  const [draftSnapshot, setDraftSnapshot] = useState<ItemDraft | null>(null);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [unavailableProviders, setUnavailableProviders] = useState<PlaceProviderId[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<PlaceSearchResult | null>(null);
  const [pendingDraft, setPendingDraft] = useState<PendingPlaceDraft | null>(null);
  const [isMapPickerVisible, setIsMapPickerVisible] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const searchGeneration = useRef(0);
  const loadingMore = useRef<number | null>(null);
  const confirming = useRef(false);
  const queryContextKey = JSON.stringify({
    center: initialQuery?.center ?? null,
    countryCode: initialQuery?.region?.countryCode ?? null,
    searchCity,
    useMapCenter,
    limit: initialQuery?.limit ?? null,
  });
  const lastQueryContextKey = useRef(queryContextKey);
  const targetConfirmation = confirmation ?? mapPicker?.confirmation;
  const targetLabel = targetConfirmation?.dayId === null
    ? '未安排'
    : targetDayIndex ? `第 ${targetDayIndex} 天` : '当天行程';
  const destinationCopy = targetConfirmation
    ? `${targetConfirmation.pickOnly || targetConfirmation.onSelectTarget ? '当前行程' : '添加到'}${targetLabel}${initialDate ? ` · ${formatDateZhWeekday(initialDate)}` : ''}`
    : null;
  const scopeLabel = searchCity
    ? `${session.providerId === 'google' ? '优先城市' : '城市'}：${searchCity}`
    : useMapCenter ? '地图附近' : '按关键词搜索';
  const buildQuery = (value: string, cursor?: string): PlaceSearchQuery => ({
    keyword: value,
    ...(initialQuery?.limit ? { limit: initialQuery.limit } : {}),
    ...(useMapCenter && !searchCity && initialQuery?.center ? { center: initialQuery.center } : {}),
    ...(searchCity || initialQuery?.region?.countryCode ? {
      region: {
        ...(searchCity ? { city: searchCity } : {}),
        ...(initialQuery?.region?.countryCode ? { countryCode: initialQuery.region.countryCode } : {}),
      },
    } : {}),
    ...(cursor ? { cursor } : {}),
  });

  useEffect(() => {
    if (lastQueryContextKey.current === queryContextKey) return;
    lastQueryContextKey.current = queryContextKey;
    searchGeneration.current += 1;
    loadingMore.current = null;
    setResults([]);
    setNextCursor(null);
    setSuggestions([]);
    setUnavailableProviders([]);
    setHasSearched(false);
    setIsSearching(false);
    setIsLoadingMore(false);
    setError(null);
    setLoadMoreError(null);
  }, [queryContextKey]);

  const search = async (value = keyword) => {
    Keyboard.dismiss();
    const trimmedKeyword = value.trim();
    const generation = ++searchGeneration.current;
    loadingMore.current = null;
    setIsLoadingMore(false);
    if (!trimmedKeyword) {
      setError('请输入地点名称后再搜索。');
      setHasSearched(false);
      setResults([]);
      setNextCursor(null);
      setSuggestions([]);
      setUnavailableProviders([]);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setError(null);
    setLoadMoreError(null);
    setResults([]);
    setNextCursor(null);
    setSuggestions([]);
    setUnavailableProviders([]);
    try {
      const query = buildQuery(trimmedKeyword);
      const page = await session.provider.search(query);
      if (generation !== searchGeneration.current) return;
      setResults(page.results);
      setNextCursor(page.nextCursor);
      setSuggestions(page.results.length === 0
        ? [...new Set([...(page.suggestions ?? []), ...(emptySearchSuggestions ?? [])])]
        : page.suggestions ?? []);
      setUnavailableProviders(page.unavailableProviders ?? []);
    } catch (searchError: unknown) {
      if (generation === searchGeneration.current) setError(errorMessage(searchError));
    } finally {
      if (generation === searchGeneration.current) setIsSearching(false);
    }
  };

  const loadMore = async () => {
    const cursor = nextCursor;
    const generation = searchGeneration.current;
    const trimmedKeyword = keyword.trim();
    if (!cursor || !trimmedKeyword || loadingMore.current !== null || isSearching) return;
    loadingMore.current = generation;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await session.provider.search(buildQuery(trimmedKeyword, cursor));
      if (generation !== searchGeneration.current) return;
      setResults((current) => {
        const identities = new Set(current.map(resultIdentity));
        const added = page.results.filter((result) => {
          const identity = resultIdentity(result);
          if (identities.has(identity)) return false;
          identities.add(identity);
          return true;
        });
        return [...current, ...added];
      });
      setNextCursor(page.nextCursor);
      setUnavailableProviders(page.unavailableProviders ?? []);
      if (page.suggestions?.length) setSuggestions(page.suggestions);
    } catch (pageError: unknown) {
      if (generation === searchGeneration.current) {
        setLoadMoreError(errorMessage(pageError));
      }
    } finally {
      if (generation === searchGeneration.current) {
        loadingMore.current = null;
        setIsLoadingMore(false);
      }
    }
  };

  /**
   * A caller that owns the draft (the Item editor) receives the selection and
   * closes the picker instead of writing anything. `false` means the caller
   * wants the flow to commit as before.
   */
  const selectTarget = (target: PlaceSelectionTarget): boolean => {
    const handler = target.kind === 'map-picker'
      ? mapPicker?.confirmation?.onSelectTarget
      : confirmation?.onSelectTarget;
    if (!handler) return false;
    setPreviewResult(null);
    setIsMapPickerVisible(false);
    handler(target);
    return true;
  };

  const confirmPreview = (result: PlaceSearchResult) => {
    if (confirming.current) return;
    if (selectTarget({ kind: 'search', result })) return;
    if (!confirmation) return;
    if (confirmation.pickOnly) {
      void commitPick({ kind: 'search', result });
      return;
    }
    setPendingDraft({ kind: 'search', result });
    setPreviewResult(null);
  };

  const confirmPickedCoordinate = (selection: MapPickerSelection) => {
    if (selectTarget({
      kind: 'map-picker',
      coordinate: selection.coordinate,
      enrichment: selection.enrichment,
      ...(session.providerId === 'apple' ? { provider: 'apple' as const } : {}),
    })) return;
    const pickerConfirmation = mapPicker?.confirmation;
    if (!pickerConfirmation) {
      mapPicker?.onUseCoordinate(selection);
      setIsMapPickerVisible(false);
      return;
    }
    setPickerError(null);
    if (pickerConfirmation.pickOnly) {
      void commitPick({ kind: 'map-picker', selection });
      return;
    }
    setPendingDraft({ kind: 'map-picker', selection });
    setIsMapPickerVisible(false);
  };

  /**
   * The pick-only path has no draft form to report a failure, so it owns its own
   * error surface. The draft path keeps reporting through `ItemDraftForm`.
   */
  const commitPick = async (
    pick:
      | Readonly<{ kind: 'search'; result: PlaceSearchResult }>
      | Readonly<{ kind: 'map-picker'; selection: MapPickerSelection }>,
  ) => {
    // A ref, not the state, is authoritative for a synchronous double tap.
    if (confirming.current) return;
    confirming.current = true;
    setConfirmError(null);
    setIsConfirming(true);
    try {
      if (pick.kind === 'search') {
        if (!confirmation) return;
        const saved = await confirmation.command({
          tripId: confirmation.tripId,
          dayId: confirmation.dayId,
          result: pick.result,
        });
        setPreviewResult(null);
        confirmation.onConfirmed?.(saved.data);
        return;
      }
      if (!mapPicker?.confirmation) return;
      const saved = await mapPicker.confirmation.command({
        tripId: mapPicker.confirmation.tripId,
        dayId: mapPicker.confirmation.dayId,
        coordinate: pick.selection.coordinate,
        enrichment: pick.selection.enrichment,
        ...(session.providerId === 'apple' ? { provider: 'apple' as const } : {}),
      });
      setIsMapPickerVisible(false);
      mapPicker.confirmation.onConfirmed?.(saved.data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '保存失败，请重试。';
      if (pick.kind === 'map-picker') setPickerError(message);
      else setConfirmError(message);
    } finally {
      confirming.current = false;
      setIsConfirming(false);
    }
  };

  const saveDraft = async (draft: ItemDraft) => {
    if (!pendingDraft) return;
    const defaultTitle = pendingDraft.kind === 'search'
      ? pendingDraft.result.name
      : pendingDraft.selection.enrichment?.name?.trim()
        || pendingDraft.selection.enrichment?.address?.trim()
        || `${pendingDraft.selection.coordinate.latitude.toFixed(5)}, ${pendingDraft.selection.coordinate.longitude.toFixed(5)}`;
    const resolvedDraft = { ...draft, title: draft.title.trim() || defaultTitle };
    if (pendingDraft.kind === 'search' && confirmation) {
      const saved = await confirmation.command({
        tripId: confirmation.tripId,
        dayId: confirmation.dayId,
        result: pendingDraft.result,
        draft: resolvedDraft,
      });
      confirmation.onConfirmed?.(saved.data);
      setPendingDraft(null);
      setDraftSnapshot(null);
      return;
    }
    if (pendingDraft.kind === 'map-picker' && mapPicker?.confirmation) {
      const saved = await mapPicker.confirmation.command({
        tripId: mapPicker.confirmation.tripId,
        dayId: mapPicker.confirmation.dayId,
        coordinate: pendingDraft.selection.coordinate,
        enrichment: pendingDraft.selection.enrichment,
        ...(session.providerId === 'apple' ? { provider: 'apple' as const } : {}),
        draft: resolvedDraft,
      });
      mapPicker.confirmation.onConfirmed?.(saved.data);
      setPendingDraft(null);
      setDraftSnapshot(null);
    }
  };

  const initialDraft = pendingDraft ? draftSnapshot ?? {
    title: '',
    type: (pendingDraft.kind === 'search' ? confirmation?.itemType : mapPicker?.confirmation?.itemType)
      ?? 'sightseeing',
    timeMode: 'none' as const,
    startDateTime: null,
    endDateTime: null,
    period: null,
    note: null,
  } : null;

  if (isMapPickerVisible && mapPicker) {
    return (
      <MapPicker
        errorMessage={pickerError}
        isConfirming={isConfirming}
        initialCoordinate={mapPicker.initialCoordinate}
        mapRenderer={mapPicker.mapRenderer}
        onCancel={() => {
          if (confirming.current) return;
          setPickerError(null);
          setIsMapPickerVisible(false);
        }}
        onCoordinateChange={mapPicker.onCoordinateChange}
        onUseCoordinate={confirmPickedCoordinate}
        session={session.automatic ? {
          ...session,
          coordinateSystem: mapPicker.initialCoordinate.system,
          providerId: mapPicker.initialCoordinate.system === 'gcj02' ? 'amap' : 'google',
          mapRegion: mapPicker.initialCoordinate.system === 'gcj02' ? 'china_mainland' : 'global',
        } : session}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { paddingTop: insets.top + spacing.lg }]}
      testID="place-search"
    >
      <View style={styles.header}>
        {onCancel ? (
          <Pressable
            accessibilityLabel="返回"
            accessibilityRole="button"
            onPress={() => { if (!confirming.current) onCancel(); }}
            style={({ pressed }) => [styles.back, pressed ? styles.backPressed : null]}
            testID="place-search-cancel"
          >
            <Text style={styles.backIcon}>‹</Text>
            <Text style={styles.backLabel}>返回</Text>
          </Pressable>
        ) : null}
        <View style={styles.headerCopy}>
          <Text style={styles.title} testID="place-search-title">{title}</Text>
          {session.automatic || session.providerId === 'apple' ? null : (
            <Text style={styles.provider}>搜索服务 · {providerLabels[session.providerId]}</Text>
          )}
        </View>
      </View>
      {destinationCopy ? <Text style={styles.provider} testID="place-search-destination">{destinationCopy}</Text> : null}

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="地点名称"
          autoCapitalize="none"
          onChangeText={(value) => {
            searchGeneration.current += 1;
            loadingMore.current = null;
            setKeyword(value);
            setResults([]);
            setNextCursor(null);
            setSuggestions([]);
            setUnavailableProviders([]);
            setHasSearched(false);
            setIsSearching(false);
            setIsLoadingMore(false);
            setLoadMoreError(null);
            if (error) setError(null);
          }}
          onSubmitEditing={() => void search()}
          placeholder="搜索你已知道的地点"
          placeholderTextColor={colors.textDisabled}
          returnKeyType="search"
          style={styles.input}
          testID="place-search-input"
          value={keyword}
        />
        <AppButton
          disabled={isSearching}
          onPress={() => void search()}
          testID="place-search-submit"
          title={isSearching ? '搜索中…' : '搜索'}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`选择搜索城市，${scopeLabel}`}
        onPress={() => { setCityInput(searchCity); setIsCityEditing((value) => !value); }}
        style={styles.cityControl}
        testID="place-search-city-toggle"
      ><Text style={styles.cityLabel}>{scopeLabel} ⌄</Text></Pressable>
      {isCityEditing ? (
        <View style={styles.cityEditor} testID="place-search-city-editor">
          <TextInput accessibilityLabel="搜索城市" placeholder="城市名称（可选）" value={cityInput}
            onChangeText={setCityInput} style={styles.input} testID="place-search-city-input" />
          <View style={styles.cityActions}>
            <AppButton title="应用城市" testID="place-search-city-apply" onPress={() => {
              setSearchCity(cityInput.trim()); setUseMapCenter(false); setIsCityEditing(false); Keyboard.dismiss();
            }} />
            <AppButton title="按关键词搜索" variant="secondary" testID="place-search-city-clear" onPress={() => {
              setSearchCity(''); setCityInput(''); setUseMapCenter(false); setIsCityEditing(false); Keyboard.dismiss();
            }} />
          </View>
        </View>
      ) : null}

      {confirmError ? (
        <Text
          accessibilityRole="alert"
          style={styles.confirmError}
          testID="place-search-confirm-error"
        >
          {confirmError}
        </Text>
      ) : null}

      {isConfirming ? (
        <Text style={styles.confirming} testID="place-search-confirming">保存中…</Text>
      ) : null}

      {error ? (
        <Text style={styles.error} testID="place-search-error">{error}</Text>
      ) : null}

      {isSearching ? (
        <Text style={styles.status} testID="place-search-loading">正在搜索地点…</Text>
      ) : null}

      {unavailableProviders.length > 0 ? (
        <Text style={styles.status} testID="place-search-partial-results">
          {unavailableProviders.includes('amap')
            ? '中国大陆地点暂时无法搜索，当前显示海外结果。可重新搜索再试。'
            : '海外地点暂时无法搜索，当前显示中国大陆结果。可重新搜索再试。'}
        </Text>
      ) : null}

      <FlatList
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        data={results}
        testID="place-search-results"
        keyExtractor={(result, index) => resultKey(result, index)}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        style={styles.results}
        contentContainerStyle={styles.resultsContent}
        ListHeaderComponent={(
          <View>
            {suggestions.length > 0 ? (
              <View style={styles.suggestions} testID="place-search-suggestions">
                <Text style={styles.suggestionHeading}>试试这些搜索词</Text>
                {suggestions.map((suggestion) => (
                  <Pressable
                    accessibilityRole="button"
                    key={suggestion}
                    onPress={() => {
                      setKeyword(suggestion);
                      void search(suggestion);
                    }}
                    style={styles.suggestion}
                    testID={`place-search-suggestion-${suggestion}`}
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={hasSearched && !isSearching && !error ? (
          <EmptyHint
            hint='换个关键词，或用下方「在地图上选择地点」'
            testID="place-search-empty"
            title={`没有找到「${keyword.trim()}」的可确认地点`}
          />
        ) : null}
        ListFooterComponent={(
          <View>
            {loadMoreError ? (
              <View style={styles.loadMoreError}>
                <Text style={styles.error} testID="place-search-load-more-error">{loadMoreError}</Text>
                <AppButton
                  onPress={() => void loadMore()}
                  testID="place-search-load-more-retry"
                  title="重试加载"
                  variant="secondary"
                />
              </View>
            ) : isLoadingMore ? (
              <Text style={styles.status} testID="place-search-load-more">正在加载更多…</Text>
            ) : nextCursor ? (
              <Text style={styles.status} testID="place-search-has-more">继续滚动加载</Text>
            ) : null}
          </View>
        )}
        renderItem={({ item: result, index }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setConfirmError(null);
              if (confirmation && !confirmation.pickOnly && !confirmation.onSelectTarget) {
                setPendingDraft({ kind: 'search', result });
              } else setPreviewResult(result);
              onResultPress?.(result);
            }}
            style={styles.result}
            testID={`place-search-result-${index}`}
          >
            <View style={styles.resultCopy}>
              <View style={styles.resultNameRow}>
                <Text style={[styles.resultName, { flex: 1 }]}>{result.name}</Text>
                {result.provider === 'google' ? (
                  <GoogleMapsAttribution testID={`place-search-google-source-${index}`} />
                ) : null}
              </View>
              {result.address || result.regionLabel ? (
                <Text style={styles.resultAddress}>
                  {result.address?.trim() || result.regionLabel?.trim()}
                </Text>
              ) : null}
              <ProviderAttributions
                metadata={result.metadata}
                testID={`place-search-result-attribution-${index}`}
              />
            </View>
            {/*
             * The whole row is the action. A trailing `查看` button and the raw
             * coordinate both belonged to the detail page, so the list carries a
             * chevron instead of either.
             */}
            <Text style={styles.resultChevron} testID={`place-search-result-chevron-${index}`}>›</Text>
          </Pressable>
        )}
      />

      <View style={styles.fallback}>
        {onClearPlace ? (
          <Pressable
            accessibilityRole="button"
            onPress={onClearPlace}
            style={styles.clearPlace}
            testID="place-search-clear-place"
          >
            <Text style={styles.clearPlaceLabel}>清除地点</Text>
          </Pressable>
        ) : null}
        <Text style={styles.fallbackHint}>找不到地点，或想保存地图上的自定义位置？</Text>
        <AppButton
          onPress={() => {
            onOpenMapPicker();
            setPickerError(null);
            if (mapPicker) setIsMapPickerVisible(true);
          }}
          testID="place-search-map-picker"
          title="在地图上选择地点"
          variant="secondary"
        />
      </View>
      {previewResult ? (
        <PlacePreview
          isConfirming={isConfirming}
          confirmationError={confirmError}
          confirmLabel={
            selectionConfirmLabel ?? (confirmation?.pickOnly || confirmation?.onSelectTarget
              ? '更改为此地点'
              : '使用此地点')
          }
          mapRenderer={mapPicker?.mapRenderer}
          onClose={() => {
            if (confirming.current) return;
            setPreviewResult(null);
            setConfirmError(null);
          }}
          onConfirm={confirmation
            ? confirmPreview
            : undefined}
          onOpenInExternalMap={onOpenInExternalMap}
          result={previewResult}
          visible
        />
      ) : null}
      {pendingDraft && initialDraft ? (
        <Modal
          animationType="slide"
          onRequestClose={() => { if (!confirming.current) { setPendingDraft(null); setDraftSnapshot(null); } }}
          visible
        >
          <View style={[styles.draftModal, { paddingTop: insets.top + spacing.sm }]}>
            <View style={styles.draftHeader}>
              <Text numberOfLines={1} style={styles.draftTitle}>添加行程</Text>
            </View>
            <ItemDraftForm
              initialDate={initialDate ?? localToday()}
              initialDraft={initialDraft}
              onCancel={() => { setPendingDraft(null); setDraftSnapshot(null); }}
              onDraftChange={setDraftSnapshot}
              onSavingChange={(saving) => { confirming.current = saving; setIsConfirming(saving); }}
              onSave={saveDraft}
              leadingContent={(
                <View style={styles.draftPlace}>
                  <Text style={styles.destination}>{`添加到${targetLabel}${initialDate ? ` · ${formatDateZhWeekday(initialDate)}` : ''}`}</Text>
                  <PlacePreviewContent compact
                    result={pendingDraft.kind === 'search' ? pendingDraft.result : {
                      name: pendingDraft.selection.enrichment?.name?.trim() || pendingDraft.selection.enrichment?.address?.trim() || '地图选点',
                      address: pendingDraft.selection.enrichment?.address ?? null,
                      regionLabel: pendingDraft.selection.enrichment?.regionLabel ?? null,
                      metadata: pendingDraft.selection.enrichment?.metadata ?? null,
                      providerPlaceId: pendingDraft.selection.enrichment?.providerPlaceId ?? null,
                      provider: session.providerId,
                      coordinate: pendingDraft.selection.coordinate,
                    }}
                    mapRenderer={mapPicker?.mapRenderer}
                    onOpenInExternalMap={onOpenInExternalMap}
                  />
                  <AppButton title="更换地点" variant="secondary" testID="add-item-draft-change-place" onPress={() => {
                    if (!confirming.current) setPendingDraft(null);
                  }} />
                </View>
              )}
              saveLabel={`添加到${targetLabel}`}
              testIDPrefix="add-item-draft"
            />
          </View>
        </Modal>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  cityControl: { alignSelf: 'flex-start', minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.md, backgroundColor: colors.accentSoft, borderRadius: radius.pill },
  cityLabel: { ...typography.caption, color: colors.accentStrong, fontWeight: '600' },
  cityEditor: { gap: spacing.sm },
  cityActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  draftPlace: { gap: spacing.sm },
  destination: { ...typography.caption, color: colors.primary },
  back: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
  },
  backIcon: { color: colors.primary, fontSize: 26, fontWeight: '600', lineHeight: 28 },
  backLabel: { color: colors.primary, fontSize: 15, marginLeft: 2 },
  backPressed: { opacity: 0.7 },
  container: { flex: 1, gap: spacing.md, padding: spacing.xl },
  clearPlace: {
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  clearPlaceLabel: { ...typography.body, color: colors.danger, fontWeight: '600' },
  error: { ...typography.caption, color: colors.danger, lineHeight: 20 },
  confirmError: { ...typography.caption, color: colors.danger, lineHeight: 20, paddingTop: spacing.sm },
  confirming: { ...typography.caption, color: colors.textSubtle, lineHeight: 20, paddingTop: spacing.sm },
  fallback: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  fallbackHint: { ...typography.caption, color: colors.textSubtle },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  headerCopy: { flex: 1 },
  input: {
    ...typography.body,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  provider: { ...typography.micro, color: colors.textSubtle, marginTop: 4 },
  result: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  resultAddress: { ...typography.caption, color: colors.textMuted, marginTop: 3 },
  resultChevron: { color: colors.textDisabled, fontSize: 20, lineHeight: 22 },
  resultCopy: { flex: 1 },
  resultName: { ...typography.cardTitle, color: colors.text },
  resultNameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  loadMoreError: { alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md },
  suggestions: { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, paddingBottom: spacing.sm },
  suggestionHeading: { ...typography.caption, color: colors.textSubtle, paddingVertical: spacing.sm },
  suggestion: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingVertical: spacing.xs },
  suggestionText: { ...typography.body, color: colors.primary },
  results: { flex: 1 },
  resultsContent: { paddingBottom: spacing.sm },
  draftModal: { backgroundColor: colors.surface, flex: 1 },
  draftHeader: { alignItems: 'center', borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  draftTitle: { ...typography.cardTitle, color: colors.text },
  searchRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  status: { ...typography.caption, color: colors.textSubtle, paddingVertical: spacing.md },
  title: { ...typography.screenTitle, color: colors.text },
});
