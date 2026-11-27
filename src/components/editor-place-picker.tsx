import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlaceSelectionTarget } from '@/application/place/place-selection';
import { pendingPlaceName } from '@/application/place/place-selection';
import type { ConfirmPlaceSearchResultCommand } from '@/application/place/confirm-place-search-result';
import type { ConfirmMapPickerPlaceCommand } from '@/application/place/confirm-map-picker-place';
import type { Place } from '@/domain/place/types';
import type { Item } from '@/domain/item/types';
import type { Day, Trip } from '@/domain/trip/types';
import type { PlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import type { MapRenderer } from '@/infrastructure/map/map-renderer';
import { resolveTripMapStack } from '@/infrastructure/map/map-provider-policy';
import { colors } from '@/theme/tokens';
import { PlaceSearch } from './place-search';

export interface EditorPlacePickerServices {
  resolveSession: (trip: Trip) => Promise<PlaceProviderSession>;
  confirmSearch: ConfirmPlaceSearchResultCommand;
  confirmMapPicker: ConfirmMapPickerPlaceCommand;
}

export function selectedPlaceSummary(target: PlaceSelectionTarget | undefined, original?: Pick<Place, 'name' | 'address'>) {
  if (!target) return original;
  if (target.kind === 'none') return undefined;
  return { name: pendingPlaceName(target)!, address: target.kind === 'search'
    ? target.result.address : target.enrichment?.address ?? null };
}

/** Selection-only layer. It never writes; the editor's Save owns the transaction. */
export function EditorPlacePicker({ trip, item, day, originalPlace, pendingTarget, services, mapRenderer,
  onSelect, onClose }: {
  trip: Trip; item: Item; day?: Day; originalPlace?: Place; pendingTarget?: PlaceSelectionTarget;
  services: EditorPlacePickerServices; mapRenderer: MapRenderer;
  onSelect: (target: PlaceSelectionTarget) => void; onClose: () => void;
}) {
  const [result, setResult] = useState<{ key: string; session: PlaceProviderSession | null; error: string | null } | null>(null);
  const [retry, setRetry] = useState(0);
  const resolveSession = services.resolveSession;
  const requestKey = `${trip.id}:${trip.mapRegion}:${retry}`;
  const session = result?.key === requestKey ? result.session : null;
  const error = result?.key === requestKey ? result.error : null;
  useEffect(() => {
    let cancelled = false;
    void resolveSession(trip).then(value => { if (!cancelled) setResult({ key: requestKey, session: value, error: null }); }, cause => {
      if (!cancelled) setResult({ key: requestKey, session: null, error: cause instanceof Error ? cause.message : '地点服务初始化失败' });
    });
    return () => { cancelled = true; };
  }, [trip, resolveSession, requestKey]);
  if (!session) return <View style={styles.status} testID="editor-place-picker-status">
    <Text style={styles.text}>{error ?? '地点服务初始化中…'}</Text>
    {error ? <Pressable onPress={() => setRetry(v => v + 1)} style={styles.action} testID="editor-place-picker-retry"><Text style={styles.link}>重试</Text></Pressable> : null}
    <Pressable onPress={onClose} style={styles.action} testID="editor-place-picker-close"><Text style={styles.link}>返回编辑</Text></Pressable>
  </View>;
  const selectedCoordinate = pendingTarget?.kind === 'search' ? pendingTarget.result.coordinate
    : pendingTarget?.kind === 'map-picker' ? pendingTarget.coordinate : originalPlace?.coordinate;
  const system = resolveTripMapStack(trip).coordinateSystem;
  const initialCoordinate = selectedCoordinate?.system === system ? selectedCoordinate
    : { latitude: system === 'gcj02' ? 39.9042 : 0, longitude: system === 'gcj02' ? 116.4074 : 0, system };
  return <PlaceSearch title="更改地点" session={session} onCancel={onClose}
    initialDate={day?.date} targetDayIndex={day?.dayIndex}
    initialQuery={{ center: initialCoordinate }}
    confirmation={{ command: services.confirmSearch, tripId: trip.id, dayId: item.dayId,
      pickOnly: true, onSelectTarget: onSelect }}
    mapPicker={{ mapRenderer, initialCoordinate, onUseCoordinate: () => undefined,
      confirmation: { command: services.confirmMapPicker, tripId: trip.id, dayId: item.dayId,
        pickOnly: true, onSelectTarget: onSelect } }}
    onOpenMapPicker={() => undefined} />;
}

const styles = StyleSheet.create({
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: colors.surface },
  text: { color: colors.text, textAlign: 'center' },
  link: { color: colors.primary, fontWeight: '600' },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20 },
});
