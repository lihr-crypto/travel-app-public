import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlaceSearchResult } from '@/infrastructure/place/place-provider';
import type { MapRenderer } from '@/infrastructure/map/map-renderer';
import { colors, MIN_TOUCH_TARGET, radius, spacing, typography } from '@/theme/tokens';
import { ProviderAttributions } from './provider-attributions';
import { GoogleMapsAttribution } from './google-maps-attribution';
import { AppButton } from './ui/app-button';

export interface PlacePreviewProps {
  result: PlaceSearchResult;
  visible: boolean;
  onClose: () => void;
  /**
   * The app's existing map renderer. The preview shows the POI pin and frames it,
   * which is what tells a scenic area, a parking lot, a visitor centre and a
   * same-named city apart.
   */
  mapRenderer?: MapRenderer;
  /** `更改为此地点` in replace mode, `使用此地点` when adding a new Item. */
  confirmLabel?: string;
  /** Emits the selection; persistence stays with the caller. */
  onConfirm?: (result: PlaceSearchResult) => void;
  isConfirming?: boolean;
  confirmationError?: string | null;
  /** Provider-aware handoff; absent hides the row. */
  onOpenInExternalMap?: (result: PlaceSearchResult) => Promise<unknown> | unknown;
}

export interface PlacePreviewContentProps {
  result: PlaceSearchResult;
  mapRenderer?: MapRenderer;
  onOpenInExternalMap?: (result: PlaceSearchResult) => Promise<unknown> | unknown;
  compact?: boolean;
}

const providerLabels = {
  apple: '苹果地图',
  amap: '高德地图',
  google: 'Google Maps',
} as const;

function coordinateLabel(result: PlaceSearchResult) {
  return `${result.coordinate.latitude.toFixed(5)}, ${result.coordinate.longitude.toFixed(5)}`;
}

function nonEmptyText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

/**
 * Readable place identity shared by the full preview and the add-item form.
 * Technical provider fields stay behind an explicit, accessible disclosure.
 */
export function PlacePreviewContent({
  result,
  mapRenderer: MapRendererComponent,
  onOpenInExternalMap,
  compact = false,
}: PlacePreviewContentProps) {
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const typeLabel = result.metadata?.types;
  const types = Array.isArray(typeLabel) ? typeLabel.join(' · ') : undefined;
  const coordinate = coordinateLabel(result);
  const address = nonEmptyText(result.address);
  const region = nonEmptyText(result.regionLabel);
  const primaryAddress = address ?? region;

  const handleOpenInExternalMap = async () => {
    if (!onOpenInExternalMap) return;
    setHandoffError(null);
    try {
      await onOpenInExternalMap(result);
    } catch (error: unknown) {
      setHandoffError(error instanceof Error ? error.message : '无法打开外部地图。');
    }
  };

  return (
    <View style={compact ? styles.compactContent : styles.content} testID="place-preview-content">
      {MapRendererComponent ? (
        <View
          style={[styles.mapFrame, compact ? styles.compactMapFrame : null]}
          testID="place-preview-map"
        >
          <MapRendererComponent
            cameraRequest={{
              coordinates: [result.coordinate],
              requestId: 1,
              scopeKey: `${coordinate}:${result.providerPlaceId ?? result.name}`,
            }}
            markers={[{
              id: 'place-preview-poi',
              coordinate: result.coordinate,
              label: result.name,
              variant: 'selected',
            }]}
            system={result.coordinate.system}
          />
        </View>
      ) : null}

      <Text style={compact ? styles.compactTitle : styles.title} testID="place-preview-name">
        {result.name}
      </Text>
      {primaryAddress ? (
        <Text style={styles.address} testID="place-preview-address">
          {primaryAddress}
        </Text>
      ) : null}
      {address && region && address !== region ? (
        <Text style={styles.region} testID="place-preview-region">{region}</Text>
      ) : null}

      {result.provider === 'google' ? (
        <GoogleMapsAttribution testID="place-preview-google-attribution" />
      ) : (
        <Text style={styles.provider} testID="place-preview-provider">
          {providerLabels[result.provider]}
        </Text>
      )}
      <ProviderAttributions metadata={result.metadata} testID="place-preview-attributions" />

      {onOpenInExternalMap ? (
        <Pressable
          accessibilityLabel="在地图 App 中打开"
          accessibilityRole="button"
          onPress={() => void handleOpenInExternalMap()}
          style={styles.externalRow}
          testID="place-preview-open-in-map"
        >
          <Text style={styles.externalLabel}>在地图 App 中打开</Text>
          <Text style={styles.externalIcon}>›</Text>
        </Pressable>
      ) : null}
      {handoffError ? (
        <Text
          accessibilityRole="alert"
          style={styles.error}
          testID="place-preview-open-in-map-error"
        >
          {handoffError}
        </Text>
      ) : null}

      <Pressable
        accessibilityLabel="地点详细信息"
        accessibilityRole="button"
        accessibilityState={{ expanded: isDetailsExpanded }}
        onPress={() => setIsDetailsExpanded((expanded) => !expanded)}
        style={styles.detailsToggle}
        testID="place-preview-details-toggle"
      >
        <Text style={styles.detailsToggleLabel}>
          {isDetailsExpanded ? '收起地点信息' : '地点信息'}
        </Text>
        <Text style={styles.detailsToggleIcon}>{isDetailsExpanded ? '⌃' : '⌄'}</Text>
      </Pressable>
      {isDetailsExpanded ? (
        <View accessibilityLabel="地点详细信息" style={styles.details} testID="place-preview-details">
          <Text style={styles.coordinate} testID="place-preview-coordinate">
            {coordinate} · {result.coordinate.system.toUpperCase()}
          </Text>
          {types ? (
            <Text style={styles.types} testID="place-preview-types">{types}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Dedicated location preview page.
 *
 * It replaces the small text-only sheet: the map is the part that makes the
 * choice verifiable, and the primary action names the task the user is in
 * (`使用此地点` / `更改为此地点`) instead of the ambiguous `继续编辑行程`.
 */
export function PlacePreview({
  result,
  visible,
  onClose,
  mapRenderer: MapRendererComponent,
  confirmLabel = '使用此地点',
  onConfirm,
  isConfirming = false,
  confirmationError = null,
  onOpenInExternalMap,
}: PlacePreviewProps) {
  const insets = useSafeAreaInsets();
  const handleClose = () => {
    if (!isConfirming) onClose();
  };
  const canConfirm = Boolean(onConfirm) && !isConfirming;

  return (
    <Modal animationType="slide" onRequestClose={handleClose} visible={visible}>
      <View
        style={[styles.container, { paddingTop: insets.top + spacing.sm }]}
        testID="place-preview"
      >
        <View style={styles.header}>
          <Pressable
            accessibilityState={{ disabled: isConfirming }}
            accessibilityLabel="返回"
            accessibilityRole="button"
            disabled={isConfirming}
            onPress={handleClose}
            style={styles.back}
            testID="place-preview-close"
          >
            <Text style={styles.backIcon}>‹</Text>
            <Text style={styles.backLabel}>返回</Text>
          </Pressable>
          <Text style={styles.headerTitle}>地点详情</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          testID="place-preview-body"
        >
          <PlacePreviewContent
            mapRenderer={MapRendererComponent}
            onOpenInExternalMap={onOpenInExternalMap}
            result={result}
          />
        </ScrollView>

        <View
          style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
          testID="place-preview-actions"
        >
          {confirmationError ? (
            <Text
              accessibilityRole="alert"
              style={styles.error}
              testID="place-preview-error"
            >
              {confirmationError}
            </Text>
          ) : null}
          <AppButton
            accessibilityLabel={isConfirming ? '正在确认地点' : confirmLabel}
            disabled={!canConfirm}
            onPress={canConfirm ? () => onConfirm?.(result) : undefined}
            testID="place-preview-confirm"
            title={isConfirming ? '处理中…' : confirmLabel}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    backgroundColor: colors.surface,
    borderTopColor: colors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  address: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  back: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
  },
  backIcon: { color: colors.primary, fontSize: 26, fontWeight: '600', lineHeight: 28 },
  backLabel: { color: colors.primary, fontSize: 15, marginLeft: 2 },
  compactContent: { gap: spacing.xs },
  compactMapFrame: { height: 136 },
  compactTitle: { ...typography.cardTitle, color: colors.text, marginTop: 0 },
  container: {
    backgroundColor: colors.surface,
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  coordinate: { ...typography.caption, color: colors.textSubtle, fontVariant: ['tabular-nums'] },
  content: { gap: spacing.sm },
  details: { gap: spacing.xs, paddingTop: spacing.xs },
  detailsToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
  },
  detailsToggleIcon: { color: colors.textSubtle, fontSize: 18 },
  detailsToggleLabel: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger, lineHeight: 20 },
  externalIcon: { color: colors.primary, fontSize: 18 },
  externalLabel: { ...typography.body, color: colors.primary, fontWeight: '600' },
  externalRow: {
    alignItems: 'center',
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  headerSpacer: { width: MIN_TOUCH_TARGET },
  headerTitle: { ...typography.cardTitle, color: colors.text },
  mapFrame: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 240,
    overflow: 'hidden',
  },
  provider: { ...typography.micro, color: colors.textSubtle },
  region: { ...typography.caption, color: colors.textSubtle },
  scrollContent: { paddingBottom: spacing.lg },
  title: { ...typography.screenTitle, color: colors.text, marginTop: spacing.xs },
  types: { ...typography.caption, color: colors.textMuted },
});
