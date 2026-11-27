import { StyleSheet, Text, View } from 'react-native';

import type { HomeRecap } from '@/application/projections/home-recap';
import { colors } from '@/theme/tokens';

/**
 * Home recap — the one-line 累计/年度 summary above the 我的旅行 rows.
 *
 * It counts saved itineraries for exactly the Trips the list shows, so it
 * answers the filter above it rather than adding a second surface. The numbers
 * carry the weight and the units stay quiet. Labels say 旅行 / 行程天数 / 地点 —
 * Footprint is a saved plan, not a visit log (Stage-03 §3.1, UX-02) — and one
 * line keeps the list the main thing at the sheet's default height.
 */

export interface HomeRecapLineProps {
  recap: HomeRecap;
}

export function HomeRecapLine({ recap }: HomeRecapLineProps) {
  if (recap.tripCount === 0) return null;

  const parts = [
    { id: 'trips', label: '次旅行', value: recap.tripCount },
    { id: 'days', label: '天行程', value: recap.dayCount },
    { id: 'places', label: '个地点', value: recap.placeCount },
  ] as const;

  return (
    <View
      accessibilityLabel={parts.map(({ label, value }) => `${value} ${label}`).join('，')}
      accessible
      style={styles.row}
      testID="home-recap"
    >
      {parts.map(({ id, label, value }) => (
        <Text key={id} style={styles.unit} testID={`home-recap-${id}`}>
          <Text style={styles.number}>{value}</Text>
          {` ${label}`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  number: {
    color: colors.text,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  row: { columnGap: 18, flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  unit: { color: colors.textSubtle, fontSize: 13 },
});
