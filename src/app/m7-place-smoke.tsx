import { useEffect, useMemo, useState } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ConfirmedPlaceItem } from '@/application/place/confirm-place-search-result';
import { AmapPrivacyGate } from '@/components/amap-privacy-gate';
import { PlaceSearch } from '@/components/place-search';
import type { PersistedM4MapFixture } from '@/infrastructure/database/m4-map-fixtures';
import {
  installM4MapFixtures,
  loadM4MapFixtures,
} from '@/infrastructure/database';
import {
  confirmMapPickerPlaceCommand,
  confirmPlaceSearchResultCommand,
} from '@/infrastructure/database/item-command';
import { AmapMapRenderer } from '@/infrastructure/map/amap-map-renderer';
import { openPlaceInExternalMap } from '@/infrastructure/map/external-map-handoff';
import { GoogleMapRenderer } from '@/infrastructure/map/google-map-renderer';
import type { PlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import { resolvePlaceProviderSession } from '@/infrastructure/place/place-provider-session';

function ProviderSmokeFlow({ fixture }: { fixture: PersistedM4MapFixture }) {
  const [session, setSession] = useState<PlaceProviderSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ConfirmedPlaceItem | null>(null);
  const [handoff, setHandoff] = useState<string | null>(null);
  const [forceCoordinateOnly, setForceCoordinateOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void resolvePlaceProviderSession(fixture.trip).then(
      (value) => { if (!cancelled) setSession(value); },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => { cancelled = true; };
  }, [fixture]);

  const effectiveSession = useMemo(() => {
    if (!session || !forceCoordinateOnly) return session;
    return {
      ...session,
      provider: {
        search: (query: Parameters<typeof session.provider.search>[0]) =>
          session.provider.search(query),
      },
    } satisfies PlaceProviderSession;
  }, [forceCoordinateOnly, session]);

  if (error) return <Text style={styles.error} testID="m7-smoke-error">{error}</Text>;
  if (!effectiveSession) return <Text testID="m7-smoke-loading">地点服务初始化中…</Text>;

  const MapRenderer = fixture.stack.renderer === 'amap'
    ? AmapMapRenderer
    : GoogleMapRenderer;
  const onConfirmed = (value: ConfirmedPlaceItem) => {
    setSaved(value);
    setHandoff(null);
  };

  return (
    <View style={styles.flow} testID={`m7-smoke-${fixture.stack.placeProvider}`}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setForceCoordinateOnly((value) => !value)}
        testID="m7-force-coordinate-only"
      >
        <Text style={styles.link}>
          {forceCoordinateOnly ? '恢复反向地理编码' : '强制坐标兜底模式'}
        </Text>
      </Pressable>
      <Text testID="m7-enrichment-mode">
        {forceCoordinateOnly ? '坐标兜底，无地址 enrichment' : '使用 provider 原生 enrichment'}
      </Text>
      <PlaceSearch
        confirmation={{
          command: confirmPlaceSearchResultCommand,
          dayId: fixture.day.id,
          onConfirmed,
          tripId: fixture.trip.id,
        }}
        initialQuery={{
          center: fixture.place.coordinate,
          region: fixture.trip.mapRegion === 'china_mainland'
            ? { city: '北京', countryCode: 'CN' }
            : { city: 'Sydney', countryCode: 'AU' },
        }}
        mapPicker={{
          confirmation: {
            command: confirmMapPickerPlaceCommand,
            dayId: fixture.day.id,
            onConfirmed,
            tripId: fixture.trip.id,
          },
          initialCoordinate: fixture.place.coordinate,
          mapRenderer: MapRenderer,
          onUseCoordinate: () => undefined,
        }}
        onOpenMapPicker={() => undefined}
        session={effectiveSession}
      />
      {saved ? (
        <View style={styles.result} testID="m7-smoke-saved">
          <Text>已保存：{saved.place.name}</Text>
          <Text>Place {saved.place.id}</Text>
          <Text>Item {saved.item.id}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setHandoff(null);
              void openPlaceInExternalMap({ place: saved.place, trip: fixture.trip }).then(
                (value) => setHandoff(`已交给 ${value.app}`),
                (cause: unknown) => setHandoff(
                  cause instanceof Error ? cause.message : String(cause),
                ),
              );
            }}
            testID="m7-smoke-open-external-map"
          >
            <Text style={styles.link}>在地图中打开</Text>
          </Pressable>
          {handoff ? <Text testID="m7-smoke-handoff-result">{handoff}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export default function M7PlaceSmokeRoute() {
  const insets = useSafeAreaInsets();
  const [fixtures, setFixtures] = useState<PersistedM4MapFixture[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!__DEV__ || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return <Text>此验收页仅供 iOS Development Build 使用。</Text>;
  }

  async function load() {
    setError(null);
    try {
      await installM4MapFixtures();
      setFixtures(await loadM4MapFixtures());
      setSelectedIndex(0);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const fixture = fixtures?.[selectedIndex];
  const flow = fixture ? <ProviderSmokeFlow fixture={fixture} key={fixture.trip.id} /> : null;

  return (
    <View style={styles.container} testID="m7-place-smoke">
      <ScrollView
        contentContainerStyle={[styles.header, { paddingTop: insets.top + 8 }]}
        style={styles.headerScroll}
      >
        <Text style={styles.title}>M7 地点能力真机验收</Text>
        <Text>使用隔离的 M4 开发 Trip；确认搜索或地图选点会新增真实本地 Place 与 Item。</Text>
        <Pressable accessibilityRole="button" onPress={() => void load()} testID="m7-load-fixtures">
          <Text style={styles.link}>加载验收 Trip</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {fixtures?.map((entry, index) => (
          <Pressable
            accessibilityRole="button"
            key={entry.trip.id}
            onPress={() => setSelectedIndex(index)}
            testID={`m7-select-${entry.stack.placeProvider}`}
          >
            <Text style={styles.link}>{entry.trip.title} · {entry.stack.placeProvider}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.body}>
        {fixture?.stack.placeProvider === 'amap'
          ? <AmapPrivacyGate key={fixture.trip.id}>{flow}</AmapPrivacyGate>
          : flow}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  container: { flex: 1 },
  error: { color: '#b42318' },
  flow: { flex: 1 },
  header: { gap: 8, padding: 16 },
  // ScrollView defaults to flexGrow: 1, which would let the fixture list share
  // the screen with the provider flow below and clip the search results.
  headerScroll: { flexGrow: 0 },
  link: { color: '#175cd3', fontSize: 15 },
  result: { backgroundColor: '#ecfdf3', gap: 4, padding: 12 },
  title: { fontSize: 20, fontWeight: '700' },
});
