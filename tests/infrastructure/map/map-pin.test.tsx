import { expect, test } from '@jest/globals';
import { StyleSheet, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';

import { getMapPinGeometry, MapPin } from '@/infrastructure/map/map-pin';

test('exports bottom-tip geometry for normal and selected pins with a 44pt hit frame', () => {
  expect(getMapPinGeometry()).toEqual({
    frameWidth: 44,
    frameHeight: 48,
    pinWidth: 28,
    pinHeight: 38,
    pinLeft: 8,
    pinTop: 4,
    tipX: 22,
    tipY: 42,
    googleAnchor: { x: 0.5, y: 0.875 },
    mapKitCenterOffset: { x: 0, y: -18 },
  });
  expect(getMapPinGeometry(true)).toEqual({
    frameWidth: 50,
    frameHeight: 56,
    pinWidth: 34,
    pinHeight: 46,
    pinLeft: 8,
    pinTop: 4,
    tipX: 25,
    tipY: 50,
    googleAnchor: { x: 0.5, y: 50 / 56 },
    mapKitCenterOffset: { x: 0, y: -22 },
  });
});

test('uses a small darker dot for unnumbered pins and round numeric aggregate badges', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<MapPin testID="unnumbered-pin" variant="unscheduled" />);
  });
  expect(renderer.root.find((node) => node.type === View && node.props.testID === 'unnumbered-pin').props.style)
    .toMatchObject({ width: 44, height: 48, backgroundColor: 'transparent' });
  expect(renderer.root.findByProps({ testID: 'unnumbered-pin-center-dot' }).props.style)
    .toMatchObject({ width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(0, 0, 0, 0.24)' });
  expect(renderer.root.findByProps({ testID: 'unnumbered-pin-body' }).props.source)
    .toEqual(require('../../../assets/map-pins/pin-unscheduled.png'));
  expect(StyleSheet.flatten(
    renderer.root.findByProps({ testID: 'unnumbered-pin-head' }).props.style,
  )).not.toHaveProperty('borderWidth');
  expect(renderer.root.findAllByProps({ testID: 'unnumbered-pin-tail' })).toHaveLength(0);
  expect(renderer.root.findAllByType(Text)).toHaveLength(0);
  act(() => renderer.unmount());

  act(() => {
    renderer = create(<MapPin testID="ordinal-pin" variant="normal" ordinal={12} />);
  });
  const ordinal = renderer.root.findByProps({ testID: 'ordinal-pin-count' });
  expect(ordinal.props.children).toBe('12');
  expect(ordinal.props.numberOfLines).toBe(1);
  expect(ordinal.props.adjustsFontSizeToFit).toBe(true);
  expect(renderer.root.findAllByProps({ testID: 'ordinal-pin-center-dot' })).toHaveLength(0);
  act(() => renderer.unmount());

  act(() => {
    renderer = create(<MapPin testID="cluster-pin" variant="normal" clusterCount={123} />);
  });
  expect(renderer.root.findByProps({ testID: 'cluster-pin-count' }).props.children).toBe('123');
  expect(renderer.root.find((node) => node.type === View && node.props.testID === 'cluster-pin').props.style)
    .toMatchObject({ width: 48, height: 48 });
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'cluster-pin-badge' }).props.style))
    .toMatchObject({
      width: 40,
      height: 40,
      left: 4,
      top: 4,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: '#fff',
      backgroundColor: '#4E7580',
    });
  expect(renderer.root.findAllByProps({ testID: 'cluster-pin-body' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'cluster-pin-count' }).props.style)
    .toEqual(expect.arrayContaining([expect.objectContaining({ fontSize: 16 })]));
  expect(renderer.root.findAll(({ props }) => props.children === '•')).toHaveLength(0);
  act(() => renderer.unmount());

  act(() => {
    renderer = create(<MapPin testID="selected-pin" variant="selected" ordinal={1} />);
  });
  expect(renderer.root.findByProps({ testID: 'selected-pin-body' }).props.source)
    .toEqual(require('../../../assets/map-pins/pin-selected.png'));
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'selected-pin-head' }).props.style))
    .toMatchObject({
      width: 34,
      height: 34,
      top: 4,
      left: 8,
    });
  // The selected outline belongs to the complete body asset, not another
  // circular icon around the number. Keep label layout transparent.
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'selected-pin-head' }).props.style))
    .not.toHaveProperty('borderWidth');
  act(() => renderer.unmount());

  act(() => {
    renderer = create(<MapPin testID="selected-cluster" variant="selected" clusterCount={123} />);
  });
  expect(renderer.root.find((node) => node.type === View && node.props.testID === 'selected-cluster').props.style)
    .toMatchObject({ width: 52, height: 52 });
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'selected-cluster-badge' }).props.style))
    .toMatchObject({ width: 44, height: 44, left: 4, top: 4, borderWidth: 3 });
  expect(renderer.root.findByProps({ testID: 'selected-cluster-count' }).props.style)
    .toEqual(expect.arrayContaining([expect.objectContaining({ fontSize: 17 })]));
  act(() => renderer.unmount());
});
