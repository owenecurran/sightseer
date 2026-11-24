import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { FeedDivider } from '@/components/ui/feed-divider';
import { JourneyLabel } from '@/components/ui/journey-label';
import { Spacing } from '@/constants/theme';
import { useRouteHoles } from '@/components/ui/journey-line-holes';
import { svgDataUri } from '@/lib/base64';
import { legBetween, type JourneyStop } from '@/lib/journey';
import { journeyRoute } from '@/lib/journey-route';

const ROUTE_HEIGHT = 140;
const ROUTE_INSET = 6;
// How far the road runs on below its own frame: past the next post's byline
// (its avatar and two lines, about 40 points, and the 8 under them) and on
// under the top edge of that post's card, which is drawn after the route
// and so covers its end. The road goes in under the card rather than
// stopping short of it in mid-air.
const ROUTE_REACH = 64;
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
  // Where the road is left out: a byline's avatar and name, as on the phone
  // (see journey-line-holes.ts).
  const { ref: frameRef, onLayout: measureFrame, holes } = useRouteHoles(width, ROUTE_HEIGHT + ROUTE_REACH);
  const drawing = useMemo(() => {
    if (width === 0) return null;
    const route = journeyRoute(seed, width, ROUTE_HEIGHT + ROUTE_REACH - ROUTE_INSET);
    const points = route.points.map((point) => `${point.x.toFixed(1)},${(point.y + ROUTE_INSET).toFixed(1)}`);
    const [startX, startY] = points[0].split(',');
    const total = ROUTE_HEIGHT + ROUTE_REACH;
    // A mask rather than a clip path, since the holes are what is taken out:
    // white keeps, black removes.
    const mask =
      holes.length === 0
        ? ''
        : `<defs><mask id="road" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${total}">` +
          `<rect x="0" y="0" width="${width}" height="${total}" fill="white"/>` +
          holes
            .map((hole) => `<rect x="${hole.x.toFixed(1)}" y="${hole.y.toFixed(1)}" width="${hole.width.toFixed(1)}" height="${hole.height.toFixed(1)}" fill="black"/>`)
            .join('') +
          `</mask></defs>`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}">` +
      mask +
      `<g${holes.length === 0 ? '' : ' mask="url(#road)"'}>` +
      `<polyline points="${points.join(' ')}" fill="none" stroke="${INK}" stroke-width="3" ` +
      `stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="10 8"/>` +
      `<circle cx="${startX}" cy="${startY}" r="4.5" fill="none" stroke="${INK}" stroke-width="2"/>` +
      `</g></svg>`;
    return { uri: svgDataUri(svg), side: route.side };
  }, [seed, width, holes]);

  if (!leg) return <FeedDivider />;
  return (
    <View
      ref={frameRef}
      collapsable={false}
      style={[styles.frame, style]}
      onLayout={(event) => {
        setWidth(Math.round(event.nativeEvent.layout.width));
        measureFrame();
      }}>
      {drawing && (
        <>
          <Image source={{ uri: drawing.uri }} style={{ width, height: ROUTE_HEIGHT + ROUTE_REACH }} contentFit="fill" />
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
  // Near the top of the route's own frame, so all its lines (places,
  // distance, days apart) clear the next post's byline below.
  label: {
    position: 'absolute',
    top: Spacing.one,
  },
});
