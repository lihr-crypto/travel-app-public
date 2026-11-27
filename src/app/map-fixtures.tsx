import { useState } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildDayMapProjection } from '@/application/projections/day-map';
import { buildTimelineProjection } from '@/application/projections/timeline';
import { AmapPrivacyGate } from '@/components/amap-privacy-gate';
import { DayTimeline } from '@/components/day-timeline';
import { AmapMapRenderer } from '@/infrastructure/map/amap-map-renderer';
import { GoogleMapRenderer } from '@/infrastructure/map/google-map-renderer';
import {
  installM4MapFixtures,
  loadM4MapFixtures,
} from '@/infrastructure/database';
import type { PersistedM4MapFixture } from '@/infrastructure/database/m4-map-fixtures';
import type { MapRendererProps } from '@/infrastructure/map/map-renderer';
import { useTripEntry } from '@/state/day-selection';
import { useDayFocusEffects } from '@/state/day-focus-effects';

export interface M4MapFixturesRouteProps {
  installFixtures?: typeof installM4MapFixtures;
  loadFixtures?: typeof loadM4MapFixtures;
}

/**
 * Real-device check that one fixture Item drives both surfaces through the
 * shared selection seam: the map marker press and the occurrence row press
 * must resolve to the same Item selection.
 */
function FixtureSelectionSync({ fixture }: { fixture: PersistedM4MapFixture }) {
  useTripEntry(fixture.trip.id);
  const data = {
    trip: fixture.trip,
    day: fixture.day,
    items: [fixture.item],
    placesById: { [fixture.place.id]: fixture.place },
  };
  const effects = useDayFocusEffects(data);
  const map = buildDayMapProjection(data, effects.selectedItemId);

  const mapProps: MapRendererProps = {
    system: fixture.stack.coordinateSystem,
    markers: map.markers,
    cameraRequest: effects.cameraRequest,
    onMarkerPress: effects.selectFromMap,
  };

  return (
    <>
      <Text testID="m4-fixture-details">
        {fixture.trip.id} · {fixture.stack.mapRegion} · {fixture.stack.coordinateSystem}
        {'\n'}Item {fixture.item.id} → Place {fixture.place.id}
        {'\n'}{fixture.place.coordinate.latitude.toFixed(6)},
        {fixture.place.coordinate.longitude.toFixed(6)}
      </Text>
      <Text testID="m4-fixture-selection">
        {effects.selectedItemId === fixture.item.id
          ? `已选中 Item：${fixture.item.id}` : '未选中 Item'}
      </Text>
      <View style={styles.mapFrame} testID="m4-fixture-map-frame">
        {fixture.stack.renderer === 'amap' ? (
          <AmapPrivacyGate key={fixture.trip.id}>
            <AmapMapRenderer {...mapProps} />
          </AmapPrivacyGate>
        ) : (
          <GoogleMapRenderer {...mapProps} />
        )}
      </View>
      <Pressable accessibilityRole="button" onPress={effects.fitDay} testID="m4-fit-day">
        <Text>在地图上显示整天</Text>
      </Pressable>
      <DayTimeline
        onSelectItem={effects.selectFromTimeline}
        projection={buildTimelineProjection(data)}
        scrollRequest={effects.scrollRequest}
        selectedItemId={effects.selectedItemId}
      />
    </>
  );
}

/** Temporary real-device fixture check, not the product Day Map projection. */
export default function M4MapFixturesRoute({
  installFixtures = installM4MapFixtures,
  loadFixtures = loadM4MapFixtures,
}: M4MapFixturesRouteProps) {
  const [fixtures, setFixtures] = useState<PersistedM4MapFixture[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  if (!__DEV__ || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return <Text>此样本验收页仅供 iOS Development Build 使用。</Text>;
  }

  async function installAndLoad() {
    setLoading(true);
    setError(null);
    try {
      await installFixtures();
      setFixtures(await loadFixtures());
      setSelectedIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  const fixture = fixtures?.[selectedIndex];

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      testID="m4-map-fixtures"
    >
      <Text style={styles.title}>M4 地图原生验收样本</Text>
      <Text>只在点击后写入两条独立的开发测试 Trip，不修改现有行程。</Text>
      <Pressable
        testID="m4-install-fixtures"
        disabled={loading}
        onPress={() => void installAndLoad()}
      >
        <Text>{loading ? '正在加载…' : '加载持久化地图样本'}</Text>
      </Pressable>
      {error ? <Text testID="m4-fixture-error">{error}</Text> : null}
      {fixtures?.map((entry, index) => (
        <Pressable
          key={entry.trip.id}
          testID={`m4-select-${entry.stack.renderer}`}
          onPress={() => setSelectedIndex(index)}
        >
          <Text>{entry.trip.title} · {entry.stack.renderer}</Text>
        </Pressable>
      ))}
      {fixture ? (
        <FixtureSelectionSync fixture={fixture} key={fixture.trip.id} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 16 },
  title: { fontSize: 18, fontWeight: '600' },
  mapFrame: { height: 420 },
});
