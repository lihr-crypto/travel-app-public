import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { markerColors } from '@/theme/tokens';
import type { MapMarkerModel } from './map-models';

const HIT_TARGET = 44;

export interface MapPinPoint {
  x: number;
  y: number;
}

export interface MapPinGeometry {
  /** Full transparent marker view, including its >=44pt hit area. */
  frameWidth: number;
  frameHeight: number;
  pinWidth: number;
  pinHeight: number;
  pinLeft: number;
  pinTop: number;
  /** Exact tip location in the marker view's coordinate system. */
  tipX: number;
  tipY: number;
  googleAnchor: MapPinPoint;
  mapKitCenterOffset: MapPinPoint;
}

/**
 * Geometry shared by the Google and MapKit adapters. The transparent frame is
 * bottom anchored at its tip so the saved coordinate remains the pin target.
 */
export function getMapPinGeometry(selected = false): MapPinGeometry {
  const frameWidth = selected ? 50 : HIT_TARGET;
  const frameHeight = selected ? 56 : 48;
  const pinWidth = selected ? 34 : 28;
  const pinHeight = selected ? 46 : 38;
  const tipY = selected ? 50 : 42;
  const tipX = frameWidth / 2;

  return {
    frameWidth,
    frameHeight,
    pinWidth,
    pinHeight,
    pinLeft: (frameWidth - pinWidth) / 2,
    pinTop: 4,
    tipX,
    tipY,
    googleAnchor: { x: tipX / frameWidth, y: tipY / frameHeight },
    // MapKit offsets the annotation view's center from its coordinate. Move
    // the center up so the bottom tip, rather than the view center, is pinned.
    mapKitCenterOffset: {
      x: frameWidth / 2 - tipX,
      y: frameHeight / 2 - tipY,
    },
  };
}

export interface MapPinProps {
  variant: MapMarkerModel['variant'];
  ordinal?: number;
  clusterCount?: number;
  testID?: string;
}

const bodyForVariant: Record<MapMarkerModel['variant'], ImageSourcePropType> = {
  normal: require('../../../assets/map-pins/pin-normal.png'),
  selected: require('../../../assets/map-pins/pin-selected.png'),
  unscheduled: require('../../../assets/map-pins/pin-unscheduled.png'),
  cluster: require('../../../assets/map-pins/pin-normal.png'),
};

/** The same curved silhouette, shadow and palette as the native AMap pins. */
export function MapPin({ variant, ordinal, clusterCount, testID }: MapPinProps) {
  const selected = variant === 'selected';
  const geometry = getMapPinGeometry(selected);
  const headDiameter = geometry.pinWidth;
  if (clusterCount !== undefined) {
    const frameSize = selected ? 52 : 48;
    const circleSize = selected ? 44 : 40;
    const borderWidth = selected ? 3 : 2;
    return (
      <View
        testID={testID}
        accessible={false}
        style={{ width: frameSize, height: frameSize, backgroundColor: 'transparent' }}
      >
        <View
          testID={testID ? `${testID}-badge` : undefined}
          style={[
            styles.badge,
            {
              width: circleSize,
              height: circleSize,
              left: (frameSize - circleSize) / 2,
              top: (frameSize - circleSize) / 2,
              borderRadius: circleSize / 2,
              borderWidth,
            },
          ]}
        >
          <Text
            testID={testID ? `${testID}-count` : undefined}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            style={[styles.badgeText, { fontSize: selected ? 17 : 16 }]}
          >
            {String(clusterCount)}
          </Text>
        </View>
      </View>
    );
  }

  const text = ordinal !== undefined ? String(ordinal) : null;

  return (
    <View
      testID={testID}
      accessible={false}
      style={{
        width: geometry.frameWidth,
        height: geometry.frameHeight,
        backgroundColor: 'transparent',
      }}
    >
      <Image
        testID={testID ? `${testID}-body` : undefined}
        source={bodyForVariant[variant]}
        resizeMode="stretch"
        style={StyleSheet.absoluteFill}
      />
      <View
        testID={testID ? `${testID}-head` : undefined}
        style={[
          styles.head,
          {
            top: geometry.pinTop,
            left: geometry.pinLeft,
            width: headDiameter,
            height: headDiameter,
          },
        ]}
      >
        {text === null ? (
          <View
            testID={testID ? `${testID}-center-dot` : undefined}
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: 'rgba(0, 0, 0, 0.24)',
            }}
          />
        ) : (
          <Text
            testID={testID ? `${testID}-count` : undefined}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            style={[styles.markerText, { fontSize: selected ? 15 : 13 }]}
          >
            {text}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: markerColors.normal,
    borderColor: '#fff',
  },
  badgeText: {
    width: '100%',
    paddingHorizontal: 2,
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  markerText: {
    width: '100%',
    paddingHorizontal: 1,
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
