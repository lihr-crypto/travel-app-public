import { requireNativeView } from 'expo';
import * as React from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { ExpoAmapMapViewProps } from './ExpoAmapMap.types';
import {
  computeVisibleMapGeometry,
  isCameraRequestSuppressedAfterUserAction,
} from './camera-geometry';

type NativeViewProps = ExpoAmapMapViewProps & {
  onLayout: (event: LayoutChangeEvent) => void;
};

let NativeView: React.ComponentType<NativeViewProps> | undefined;

export default function ExpoAmapMapView(props: ExpoAmapMapViewProps) {
  NativeView ??= requireNativeView('ExpoAmapMap');
  const Component = NativeView;
  const [bounds, setBounds] = React.useState<{ width: number; height: number } | null>(null);
  const [userActionRequestKey, setUserActionRequestKey] = React.useState<string | null>(null);
  const cameraRequest = React.useMemo(() => {
    if (
      !props.cameraRequest
      || !bounds
      || isCameraRequestSuppressedAfterUserAction(
        props.cameraRequest.requestKey,
        userActionRequestKey,
      )
    ) return null;
    const geometry = computeVisibleMapGeometry(props.cameraRequest.padding, bounds);
    if (!geometry) return null;

    return {
      ...props.cameraRequest,
      screenAnchor: props.cameraRequest.coordinates.length === 1
        ? geometry.screenAnchor
        : { x: 0.5, y: 0.5 },
    };
  }, [props.cameraRequest, bounds, userActionRequestKey]);

  return (
    <Component
      {...props}
      cameraRequest={cameraRequest}
      onViewportChange={(event) => {
        const requestKey = event.nativeEvent.userActionRequestKey;
        if (requestKey) setUserActionRequestKey(requestKey);
        props.onViewportChange?.(event);
      }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBounds((current) => (
          current?.width === width && current.height === height
            ? current
            : { width, height }
        ));
      }}
    />
  );
}
