import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { FeedDivider } from '@/components/ui/feed-divider';
import { JourneyLabel } from '@/components/ui/journey-label';
import { svgDataUri } from '@/lib/base64';
import { legBetween, type JourneyStop } from '@/lib/journey';
import { journeyRoute } from '@/lib/journey-route';

const ROUTE_HEIGHT = 140;
const ROUTE_INSET = 6;
const INK = 'rgba(234, 231, 207, 0.85)';

type JourneyLineProps = {
  from: JourneyStop | null;
  to: JourneyStop | null;
  seed: string;
  style?: StyleProp<ViewStyle>;
};

// The web's route between two postcards: the same road as the app draws
// (see journey-line.tsx), already drawn rather than drawing itself out. Skia
// on the web has to download its engine before it can draw anything, which
// is no way to put a line between two posts.
export function JourneyLine({ from, to, seed, style }: JourneyLineProps) {
  const leg = useMemo(() => legBetween(from, to), [from, to]);
  const [width, setWidth] = useState(0);
  const drawing = useMemo(() => {
    if (width === 0) return null;
    const route = journeyRoute(seed, width, ROUTE_HEIGHT - ROUTE_INSET * 2);
    const points = route.points.map((point) => `${point.x.toFixed(1)},${(point.y + ROUTE_INSET).toFixed(1)}`);
    const [startX, startY] = points[0].split(',');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ROUTE_HEIGHT}" viewBox="0 0 ${width} ${ROUTE_HEIGHT}">` +
      `<polyline points="${points.join(' ')}" fill="none" stroke="${INK}" stroke-width="3" ` +
      `stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="10 8"/>` +
      `<circle cx="${startX}" cy="${startY}" r="4.5" fill="none" stroke="${INK}" stroke-width="2"/>` +
      `</svg>`;
    return { uri: svgDataUri(svg), side: route.side };
  }, [seed, width]);

  if (!leg) return <FeedDivider />;
  return (
    <View
      style={[styles.frame, style]}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
      {drawing && (
        <>
          <Image source={{ uri: drawing.uri }} style={{ width, height: ROUTE_HEIGHT }} contentFit="fill" />
          <View
            style={[
              styles.label,
              drawing.side === 1 ? { left: 0, right: width / 2 + 14 } : { left: width / 2 + 14, right: 0 },
            ]}>
            <JourneyLabel leg={leg} align={drawing.side === 1 ? 'right' : 'left'} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: ROUTE_HEIGHT,
  },
  label: {
    position: 'absolute',
    top: ROUTE_HEIGHT / 2 - 38,
  },
});
