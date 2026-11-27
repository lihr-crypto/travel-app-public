import { Linking, StyleSheet, Text, View } from 'react-native';

import type { PlaceSearchResult } from '@/infrastructure/place/place-provider';

interface AttributionText {
  text: string;
  url?: string;
}

function readAttributions(metadata: PlaceSearchResult['metadata']): AttributionText[] {
  const value = metadata?.attributions;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || !('text' in entry)) return [];
    const text = typeof entry.text === 'string' ? entry.text.trim() : '';
    if (!text) return [];
    const url = 'url' in entry && typeof entry.url === 'string'
      && entry.url.startsWith('https://')
      ? entry.url
      : undefined;
    return [{ text, ...(url ? { url } : {}) }];
  });
}

/** Preserves provider-supplied attribution text and opens any supplied HTTPS link. */
export function ProviderAttributions({
  metadata,
  testID = 'provider-attributions',
}: {
  metadata: PlaceSearchResult['metadata'];
  testID?: string;
}) {
  const attributions = readAttributions(metadata);
  if (attributions.length === 0) return null;

  return (
    <View style={styles.container} testID={testID}>
      {attributions.map(({ text, url }, index) => (
        <Text
          accessibilityRole={url ? 'link' : undefined}
          key={`${text}-${index}`}
          onPress={url ? () => { void Linking.openURL(url).catch(() => undefined); } : undefined}
          style={[styles.text, url ? styles.link : null]}
          testID={`${testID}-${index}`}
        >
          {text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2, paddingTop: 4 },
  link: { textDecorationLine: 'underline' },
  text: { color: '#5e5e5e', fontSize: 12, lineHeight: 16 },
});
