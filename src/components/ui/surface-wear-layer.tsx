import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import type { SurfaceWear } from '@/lib/surface-wear';

// The two kinds of surface: the app's dark panels, marked in cream, and
// cream card stock, marked in ink.
type Tone = 'panel' | 'paper';

const MARK: Record<Tone, string> = {
  panel: '234, 231, 207',
  paper: '28, 34, 24',
};
const LIGHT = '234, 231, 207';
const MOTTLE_LAYERS = [1, 0.7, 0.42];
const SHADOW = '0, 0, 0';

// What makes a flat surface read as a particular piece of paper: the sheen
// of the one light, specks of wear, and, on some surfaces and not others,
// fibres, uneven tone, a fold, a handled corner or a faded edge. See
// buildSurfaceWear for what each is and how often it turns up.
//
// Fills its parent, which has to clip to its own shape: this draws to the
// edges and past them.
export function SurfaceWearLayer({ wear, tone = 'panel' }: { wear: SurfaceWear; tone?: Tone }) {
  const mark = MARK[tone];
  const { specks, gloss, fibres, mottles, crease, corner, edge } = wear;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Soft-edged, from three faint discs one inside the next: there is no
          radial gradient to hand, and one disc at any strength showed its
          rim and read as a blob rather than as uneven tone. */}
      {mottles.map((mottle, index) =>
        MOTTLE_LAYERS.map((share) => (
          <View
            key={`mottle-${index}-${share}`}
            style={{
              position: 'absolute',
              left: mottle.left as `${number}%`,
              top: mottle.top as `${number}%`,
              width: mottle.size * share,
              height: mottle.size * share,
              borderRadius: (mottle.size * share) / 2,
              marginLeft: (mottle.size * (1 - share)) / 2,
              marginTop: (mottle.size * (1 - share)) / 2,
              backgroundColor: `rgb(${mark})`,
              opacity: mottle.opacity / MOTTLE_LAYERS.length,
            }}
          />
        )),
      )}

      <LinearGradient
        colors={[`rgba(${LIGHT},${gloss.peak})`, `rgba(${LIGHT},0)`]}
        start={{ x: 0, y: 0 }}
        end={{ x: gloss.falloff, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {corner && (
        <LinearGradient
          colors={[`rgba(${LIGHT},${corner.strength})`, `rgba(${LIGHT},0)`]}
          start={{ x: corner.x, y: corner.y }}
          end={{ x: corner.x === 0 ? 0.45 : 0.55, y: corner.y === 0 ? 0.45 : 0.55 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {edge && (
        <LinearGradient
          colors={[`rgba(${LIGHT},${edge.strength})`, `rgba(${LIGHT},0)`]}
          start={EDGE_FROM[edge.side]}
          end={EDGE_TO[edge.side]}
          style={StyleSheet.absoluteFill}
        />
      )}

      {crease && (
        // Wider than the surface, so it runs off both sides at any angle. A
        // fold is a ridge: lit on one side of the line, shaded on the other.
        <View style={[styles.crease, { top: crease.top as `${number}%`, transform: [{ rotate: `${crease.angle}deg` }] }]}>
          <View style={[styles.creaseLine, { backgroundColor: `rgba(${LIGHT},${crease.opacity})` }]} />
          <View style={[styles.creaseLine, { backgroundColor: `rgba(${SHADOW},${crease.opacity * 1.6})` }]} />
        </View>
      )}

      {fibres.map((fibre, index) => (
        <View
          key={`fibre-${index}`}
          style={{
            position: 'absolute',
            left: fibre.left as `${number}%`,
            top: fibre.top as `${number}%`,
            width: fibre.length,
            height: 1,
            backgroundColor: `rgb(${mark})`,
            opacity: fibre.opacity,
            transform: [{ rotate: `${fibre.angle}deg` }],
          }}
        />
      ))}

      {specks.map((speck, index) => (
        <View
          key={`speck-${index}`}
          style={{
            position: 'absolute',
            left: speck.left as `${number}%`,
            top: speck.top as `${number}%`,
            width: speck.size,
            height: speck.size,
            borderRadius: speck.size / 2,
            backgroundColor: `rgb(${mark})`,
            opacity: speck.opacity,
          }}
        />
      ))}
    </View>
  );
}

const EDGE_FROM = {
  top: { x: 0.5, y: 0 },
  bottom: { x: 0.5, y: 1 },
  left: { x: 0, y: 0.5 },
  right: { x: 1, y: 0.5 },
};
const EDGE_TO = {
  top: { x: 0.5, y: 0.35 },
  bottom: { x: 0.5, y: 0.65 },
  left: { x: 0.35, y: 0.5 },
  right: { x: 0.65, y: 0.5 },
};

const styles = StyleSheet.create({
  crease: {
    position: 'absolute',
    left: '-25%',
    width: '150%',
  },
  creaseLine: {
    height: 1,
  },
});
