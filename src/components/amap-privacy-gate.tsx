import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { setAmapPrivacyStatus } from '../../modules/expo-amap-map/src/ExpoAmapMapModule';
import { setAmapSearchPrivacyStatus } from '../../modules/expo-amap-search/src/ExpoAmapSearchModule';
import { colors } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  hasAcceptedAmapPrivacyConsent,
  persistAmapPrivacyConsent,
} from '@/infrastructure/map/amap-privacy-consent';

const AMAP_PRIVACY_URL = 'https://lbs.amap.com/pages/privacy/';
type GateState = 'hydrating' | 'prompt' | 'loading' | 'ready' | 'declined' | 'error';
type ErrorAction = 'hydrate' | 'accept' | 'decline';

interface NativePrivacyResult {
  allReady: boolean;
  rejected: boolean;
}

async function applyNativePrivacyStatus(agreed: boolean): Promise<NativePrivacyResult> {
  const status = { shown: true, includesAmap: true, agreed };
  const results = await Promise.allSettled([
    Promise.resolve().then(() => setAmapPrivacyStatus(status)),
    Promise.resolve().then(() => setAmapSearchPrivacyStatus(status)),
  ]);

  return {
    allReady: results.every((result) => result.status === 'fulfilled' && result.value === true),
    rejected: results.some((result) => result.status === 'rejected'),
  };
}

export function AmapPrivacyGate({ children, allowWithoutAmap = false }: {
  children: ReactNode;
  /** Optional mainland search consent must not block overseas-only search. */
  allowWithoutAmap?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<GateState>('hydrating');
  const [errorAction, setErrorAction] = useState<ErrorAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(false);

  const hydrate = useCallback(async (isCurrent: () => boolean) => {
    try {
      const accepted = await hasAcceptedAmapPrivacyConsent();
      if (!isCurrent()) return;
      if (!accepted) {
        setErrorAction(null);
        setMessage(null);
        setState('prompt');
        return;
      }

      setState('loading');
      const result = await applyNativePrivacyStatus(true);
      if (!isCurrent()) return;
      if (!result.allReady) {
        setErrorAction('hydrate');
        setMessage('地图配置或隐私状态未就绪，请重试；地图内容保持关闭。');
        setState('error');
        return;
      }
      setErrorAction(null);
      setMessage(null);
      setState('ready');
    } catch {
      if (!isCurrent()) return;
      setErrorAction('hydrate');
      setMessage('无法读取已保存的高德隐私状态，请重试；地图内容保持关闭。');
      setState('error');
    }
  }, []);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    void Promise.resolve().then(() => {
      if (active) void hydrate(() => active);
    });

    return () => {
      active = false;
      mounted.current = false;
    };
  }, [hydrate]);

  async function choose(agreed: boolean) {
    setState('loading');
    setErrorAction(null);
    setMessage(null);

    if (!agreed) {
      const [nativeResult, persistenceResult] = await Promise.allSettled([
        applyNativePrivacyStatus(false),
        persistAmapPrivacyConsent(false),
      ]);
      if (!mounted.current) return;
      if (persistenceResult.status === 'rejected') {
        setErrorAction('decline');
        setMessage('无法保存拒绝状态，请重试；地图内容保持关闭。');
        setState('error');
        return;
      }
      if (nativeResult.status === 'rejected' || nativeResult.value.rejected) {
        setMessage('拒绝状态已保存，但原生状态同步失败；地图内容保持关闭。');
      }
      setState('declined');
      return;
    }

    try {
      const result = await applyNativePrivacyStatus(true);
      if (!mounted.current) return;
      if (!result.allReady) {
        setErrorAction('accept');
        setMessage('地图配置或隐私状态未就绪，请重试；地图内容保持关闭。');
        setState('error');
        return;
      }

      await persistAmapPrivacyConsent(true);
      if (!mounted.current) return;
      setState('ready');
    } catch {
      if (!mounted.current) return;
      setErrorAction('accept');
      setMessage('无法保存或同步高德隐私同意，请重试；地图内容保持关闭。');
      setState('error');
    }
  }

  function retry() {
    switch (errorAction) {
      case 'hydrate':
        setState('hydrating');
        setMessage(null);
        void hydrate(() => mounted.current);
        break;
      case 'accept':
        void choose(true);
        break;
      case 'decline':
        void choose(false);
        break;
      default:
        break;
    }
  }

  if (state === 'ready' || (allowWithoutAmap && state === 'declined')) {
    return <>{children}</>;
  }

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + 24 }]}
      testID="amap-privacy-gate"
    >
      {state === 'hydrating' || state === 'loading' ? (
        <Text testID="amap-privacy-loading">
          {state === 'hydrating' ? '正在读取高德地图隐私状态…' : '正在更新高德地图隐私状态…'}
        </Text>
      ) : null}
      {state !== 'hydrating' && state !== 'loading' ? (
        <Text style={styles.title}>使用高德地图前请确认</Text>
      ) : null}
      <Text style={styles.body}>
        为搜索和展示中国大陆行程地点，本应用将使用高德开放平台地图 SDK。
        该 SDK 可能处理位置信息和设备信息；请先查看高德开放平台隐私权政策，再决定是否同意。
      </Text>
      <Pressable
        testID="amap-privacy-policy"
        onPress={() => void Linking.openURL(AMAP_PRIVACY_URL)}
      >
        <Text style={styles.link}>查看高德开放平台隐私权政策</Text>
      </Pressable>
      {message ? <Text testID="amap-privacy-message">{message}</Text> : null}
      {state === 'declined' ? <Text>已拒绝；高德地图不会初始化。</Text> : null}
      {state === 'error' ? (
        <Pressable testID="amap-privacy-retry" onPress={retry}>
          <Text>重试</Text>
        </Pressable>
      ) : null}
      {state === 'prompt' || state === 'declined' || (allowWithoutAmap && state === 'error') ? (
        <View style={styles.actions}>
          <Pressable
            testID="amap-privacy-decline"
            onPress={() => void choose(false)}
          >
            <Text>{allowWithoutAmap ? '暂不使用，继续搜索海外地点' : '不同意'}</Text>
          </Pressable>
          <Pressable
            testID="amap-privacy-agree"
            onPress={() => void choose(true)}
          >
            <Text>同意并使用地图</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16, padding: 24 },
  title: { fontSize: 18, fontWeight: '600' },
  body: { lineHeight: 22 },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
});
