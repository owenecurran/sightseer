import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { randomFor } from '@/lib/seeded-random';

type InkBlotProps = {
  size: number;
  // Stable per blot, so a given mark keeps its shape instead of reshuffling
  // on every render — the same rule the stickers and stamps follow.
  seed: string;
  color: string;
};

// A pressed ink mark, for "this one is chosen".
//
// A tick is a UI glyph; everything else that means something in this app is
// an object — a stamp, a sticker, a torn ticket. This is the same idea for a
// selection: the choice reads as having been stamped rather than validated.
//
// Built from overlapping circles rather than a path. There is no SVG in this
// project, and a Skia surface per blot is exactly the cost TagSticker's
// comment argues against — a union of a few Views costs nothing and is
// indistinguishable at this size. The irregularity comes from the offsets
// and radii disagreeing, which is what stops it reading as a plain dot.
const BLOB_COUNT = 6;
const SATELLITE_COUNT = 2;

type Blob = { left: number; top: number; size: number; opacity: number };

export function InkBlot({ size, seed, color }: InkBlotProps) {
  const blobs = useMemo(() => {
    const next = randomFor(`ink-blot:${seed}`);
    const list: Blob[] = [];

    // The body: circles clustered near the centre, big enough to overlap
    // into one mass. Radii vary more than positions — a blot is lumpy at its
    // edge, not scattered.
    for (let i = 0; i < BLOB_COUNT; i++) {
      // Radii disagree more than positions do: a blot is lumpy around its
      // edge rather than scattered across the space.
      const diameter = size * (0.42 + next() * 0.4);
      const spread = size * 0.19;
      list.push({
        left: size / 2 - diameter / 2 + (next() * 2 - 1) * spread,
        top: size / 2 - diameter / 2 + (next() * 2 - 1) * spread,
        size: diameter,
        opacity: 1,
      });
    }

    // Splatter: a couple of small marks thrown clear of the body. These are
    // what make it read as ink hitting paper rather than as a soft shape.
    for (let i = 0; i < SATELLITE_COUNT; i++) {
      const diameter = size * (0.07 + next() * 0.09);
      const angle = next() * Math.PI * 2;
      const distance = size * (0.34 + next() * 0.16);
      list.push({
        left: size / 2 - diameter / 2 + Math.cos(angle) * distance,
        top: size / 2 - diameter / 2 + Math.sin(angle) * distance,
        size: diameter,
        opacity: 0.55 + next() * 0.35,
      });
    }

    return list;
  }, [seed, size]);

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {blobs.map((blob, index) => (
        <View
          key={index}
          style={[
            styles.blob,
            {
              left: blob.left,
              top: blob.top,
              width: blob.size,
              height: blob.size,
              borderRadius: blob.size / 2,
              backgroundColor: color,
              opacity: blob.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
  },
});
