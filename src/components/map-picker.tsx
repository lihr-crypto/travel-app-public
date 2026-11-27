import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Coordinate } from '@/domain/common/types';
import { resolveCoordinatePlaceName } from '@/application/place/place-snapshot';
import type { MapViewport } from '@/infrastructure/map/map-models';
import type { MapRenderer } from '@/infrastructure/map/map-renderer';
import type { ReverseGeocodeResult } from '@/infrastructure/place/place-provider';
import type { PlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import { colors, spacing, typography } from '@/theme/tokens';

import { AppButton } from './ui/app-button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** What the crosshair confirms: the coordinate plus any optional enrichment. */
export interface MapPickerSelection {
  coordinate: Coordinate;
  enrichment: ReverseGeocodeResult | null;
}

export interface MapPickerProps {
  session: PlaceProviderSession;
  mapRenderer: MapRenderer;
  initialCoordinate: Coordinate;
  onUseCoordinate: (selection: MapPickerSelection) => void;
  onCoordinateChange?: (coordinate: Coordinate) => void;
  onCancel: () => void;
  /** Visible confirmation failure; the picker stays open so the pick is kept. */
  errorMessage?: string | null;
  isConfirming?: boolean;
  /**
   * Wait before asking the provider for an address, so panning does not issue a
   * request per viewport event. Tests pass 0.
   */
  enrichmentDebounceMs?: number;
}

const providerLabels = {
  apple: '苹果地图',
  amap: '高德地图',
  google: 'Google Maps',
} as const;

const DEFAULT_ENRICHMENT_DEBOUNCE_MS = 400;

type EnrichmentState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; label: string; result: ReverseGeocodeResult; coordinate: Coordinate }>
  | Readonly<{ status: 'failed' }>;

/** The picker decides what to show; the adapter reports every field separately. */
/**
 * The label the picker shows is the name the Place will be saved under.
 *
 * Both go through `resolveCoordinatePlaceName`, so the picker cannot display one
 * value while the commit stores another. It used to prefer the address here
 * while the commit preferred the place name, so an AMap pick that returned both
 * (`poiName` + `formattedAddress`, the common case on a POI) showed the address
 * and saved the POI name.
 */
function enrichmentLabel(result: ReverseGeocodeResult): string {
  return resolveCoordinatePlaceName(result, result.coordinate);
}

function sameCoordinate(left: Coordinate, right: Coordinate): boolean {
  return left.system === right.system
    && left.latitude === right.latitude
    && left.longitude === right.longitude;
}

/** Fixed-crosshair picker; the camera center remains provider-native. */
export function MapPicker({
  session,
  mapRenderer: MapRendererComponent,
  initialCoordinate,
  onUseCoordinate,
  onCoordinateChange,
  onCancel,
  errorMessage,
  isConfirming = false,
  enrichmentDebounceMs = DEFAULT_ENRICHMENT_DEBOUNCE_MS,
}: MapPickerProps) {
  assertCoordinateSystem(initialCoordinate, session.coordinateSystem);
  const insets = useSafeAreaInsets();
  const [coordinate, setCoordinate] = useState(initialCoordinate);
  const [enrichment, setEnrichment] = useState<EnrichmentState>({ status: 'idle' });
  const { provider } = session;
  const reverseGeocode = provider.reverseGeocode;

  useEffect(() => {
    if (reverseGeocode === undefined) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      // Only report loading once the request actually starts, so panning does
      // not re-render the footer on every viewport event.
      setEnrichment({ status: 'loading' });
      void (async () => {
        try {
          const result = await reverseGeocode.call(provider, { coordinate });
          if (cancelled) return;
          if (
            result !== null
            && (
              result.provider !== session.providerId
              || !sameCoordinate(result.coordinate, coordinate)
            )
          ) {
            setEnrichment({ status: 'failed' });
            return;
          }
          setEnrichment(result === null
            ? { status: 'failed' }
            : { status: 'ready', label: enrichmentLabel(result), result, coordinate });
        } catch {
          if (cancelled) return;
          setEnrichment({ status: 'failed' });
        }
      })();
    }, enrichmentDebounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [coordinate, enrichmentDebounceMs, provider, reverseGeocode, session.providerId]);

  const handleViewportChange = (viewport: MapViewport) => {
    if (isConfirming) return;
    assertCoordinateSystem(viewport.center, session.coordinateSystem);
    setCoordinate(viewport.center);
    onCoordinateChange?.(viewport.center);
  };

  /**
   * An answer is only usable while it still describes the coordinate on screen,
   * so a pan can never attach a stale address to the next pick.
   */
  const activeEnrichment = enrichment.status === 'ready'
    && sameCoordinate(enrichment.coordinate, coordinate)
    ? enrichment
    : null;
  const hasCapability = reverseGeocode !== undefined;
  const addressText = !hasCapability
    ? null
    : activeEnrichment !== null
      ? activeEnrichment.label
      : enrichment.status === 'loading'
        ? '正在解析地址…'
        : enrichment.status === 'failed'
          ? '无法解析地址，仍可保存坐标'
          : null;

  return (
    <View style={styles.container} testID="map-picker">
      <View pointerEvents={isConfirming ? 'none' : 'auto'} style={styles.map} testID="map-picker-map">
        <MapRendererComponent
          cameraRequest={{ coordinates: [initialCoordinate], requestId: 1 }}
          markers={[]}
          onViewportChange={handleViewportChange}
          system={session.coordinateSystem}
        />
      </View>

      <View pointerEvents="none" style={styles.crosshair} testID="map-picker-crosshair">
        <View style={styles.crosshairHorizontal} />
        <View style={styles.crosshairVertical} />
        <View style={styles.crosshairDot} />
      </View>

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" disabled={isConfirming} onPress={() => { if (!isConfirming) onCancel(); }} testID="map-picker-cancel">
          <Text style={styles.headerAction}>取消</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>在地图上选择地点</Text>
          <Text style={styles.provider}>{providerLabels[session.providerId]}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.hint}>移动地图，让十字准星对准要保存的位置</Text>
        <Text style={styles.coordinate} testID="map-picker-coordinate">
          {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)} · {coordinate.system.toUpperCase()}
        </Text>
        {addressText === null ? null : (
          <Text style={styles.address} testID="map-picker-address">{addressText}</Text>
        )}
        {errorMessage ? (
          <Text style={styles.error} testID="map-picker-error">{errorMessage}</Text>
        ) : null}
        <AppButton
          disabled={isConfirming}
          onPress={() => { if (!isConfirming) onUseCoordinate({
            coordinate,
            enrichment: activeEnrichment?.result ?? null,
          }); }}
          testID="map-picker-use-coordinate"
          title={isConfirming ? '处理中…' : '使用此位置'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  address: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  container: { flex: 1 },
  coordinate: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  crosshair: { alignItems: 'center', height: 44, justifyContent: 'center', left: '50%', marginLeft: -22, marginTop: -22, position: 'absolute', top: '50%', width: 44 },
  crosshairDot: { backgroundColor: colors.accentStrong, borderColor: colors.surface, borderRadius: 5, borderWidth: 2, height: 10, position: 'absolute', width: 10 },
  crosshairHorizontal: { backgroundColor: colors.accentStrong, height: 2, position: 'absolute', width: 36 },
  crosshairVertical: { backgroundColor: colors.accentStrong, height: 36, position: 'absolute', width: 2 },
  error: { ...typography.caption, color: colors.danger, textAlign: 'center' },
  footer: { backgroundColor: colors.surface, bottom: 0, gap: spacing.sm, left: 0, padding: spacing.lg, position: 'absolute', right: 0 },
  header: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'space-between', left: 0, padding: spacing.lg, position: 'absolute', right: 0, top: 0 },
  headerAction: { color: colors.primary, fontSize: 15 },
  headerCopy: { alignItems: 'center', flex: 1 },
  headerSpacer: { width: 32 },
  hint: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  map: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  provider: { ...typography.micro, color: colors.textSubtle, marginTop: 2 },
  title: { ...typography.cardTitle, color: colors.text },
});
