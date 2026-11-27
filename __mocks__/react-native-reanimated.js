/**
 * Manual Jest mock for `react-native-reanimated`.
 *
 * Jest has no native Worklets runtime, so the real implementation cannot load.
 * This mock keeps the presentation contract observable instead of silently
 * no-oping it: shared values are plain mutable objects, `withTiming` returns its
 * target value, and `useAnimatedStyle` evaluates its factory once per render.
 * Tests can therefore assert the exact animation targets a component requests.
 *
 * Jest applies a root `__mocks__/<node-module>.js` automatically, without an
 * explicit `jest.mock()` call.
 */
const React = require('react');

function useSharedValue(initial) {
  const ref = React.useRef(null);
  if (ref.current === null) {
    ref.current = { value: initial };
  }
  return ref.current;
}

const withTiming = (toValue) => toValue;
const withSpring = (toValue) => toValue;
const withDelay = (_delay, animation) => animation;
const cancelAnimation = () => undefined;
const useAnimatedStyle = (factory) => factory();
const useDerivedValue = (factory) => ({ value: factory() });
const runOnJS = (fn) => fn;
const runOnUI = (fn) => fn;
const useAnimatedRef = () => React.createRef();
const interpolate = (value) => value;

function createAnimatedComponent(type) {
  return function AnimatedComponent(props) {
    return React.createElement(type, props, props.children);
  };
}

/** `react-native-gesture-handler` wraps its detectors through this factory. */
function createAnimatedComponentPassthrough(component) {
  return component;
}

const Animated = {
  View: createAnimatedComponent('AnimatedView'),
  Text: createAnimatedComponent('AnimatedText'),
  ScrollView: createAnimatedComponent('AnimatedScrollView'),
  Image: createAnimatedComponent('AnimatedImage'),
  createAnimatedComponent: createAnimatedComponentPassthrough,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  createAnimatedComponent: createAnimatedComponentPassthrough,
  Easing: {
    bezier: () => (t) => t,
    ease: (t) => t,
    in: (fn) => fn,
    inOut: (fn) => fn,
    linear: (t) => t,
    out: (fn) => fn,
    quad: (t) => t * t,
    cubic: (t) => t * t * t,
  },
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  ReduceMotion: { Always: 'always', Never: 'never', System: 'system' },
  cancelAnimation,
  interpolate,
  runOnJS,
  runOnUI,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
};
