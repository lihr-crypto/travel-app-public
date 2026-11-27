import { StyleSheet, Text } from 'react-native';

/** Compact source text for Google results in the narrow search list. */
export function GoogleMapsAttribution({
  testID = 'google-maps-attribution',
}: {
  testID?: string;
}) {
  return (
    <Text accessibilityLabel="Google Maps" numberOfLines={1} style={styles.text} testID={testID}>
      Google Maps
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { color: '#5e5e5e', fontSize: 12, fontStyle: 'normal', fontWeight: '400' },
});
