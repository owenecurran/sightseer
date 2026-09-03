import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

// Segments in the ribbon. This is not "how many photos are visible" so much
// as how finely the curve is cut: more segments means each one spans less of
// the bend, so the ribbon follows the curve more closely and each photo is
// shorter. Seven fills a phone screen top to bottom with panels roughly as
// tall as they are wide.
// Raised from seven after seeing the wedges: each extra segment spans less
// of the bend, so consecutive panels differ by a smaller angle and the gap
// the overlap has to bury shrinks with it.
const SEGMENTS = 9;

// One full trip down the road, in ms. Slow enough to read as drifting.
const TRAVEL_MS = 30000;

// Left-right swings over the ribbon's length. Deliberately not a whole
// number, so the curve entering the top never lines up identically with the
// one leaving the bottom.
const TURNS = 1.45;

// How far the ribbon swings either side of centre, as a fraction of screen
// width.
// Wide, because the swing is the whole point — the ribbon should cross most
// of the screen rather than lean. At 0.19 the curve was there in the maths
// and invisible on the phone.
const SWING_RATIO = 0.24;

// The ribbon's width, as a fraction of screen width. Narrower than the
// swing on purpose: a band as wide as its own travel reads as a straight
// column that happens to be tilted, because its edges never clear the
// centre line.
const RIBBON_WIDTH_RATIO = 0.36;

// The gap between panels, as a fraction of a slot. Panels never overlap.
//
// They previously did, and had to: a panel bounded by two differently-angled
// cross-cuts is a trapezoid, and an affine transform — all a React Native
// View gets — can only make parallelograms, so neighbours disagreed by a
// wedge at the outside of every bend and the overlap buried it. Hiding a
// mismatch under another panel is what made the strip read as blocky: the
// silhouette became a pile of rectangles at different angles rather than a
// band with clean edges.
//
// A small, CONSTANT separation instead. It is identical on the straights
// and at the bends, it reads as a deliberate filmstrip division, and it
// makes each panel a shape in its own right — which is what lets it be
// rounded and clipped.
// Panels extend PAST their slot and are drawn in order, so each one fills
// the wedge its neighbour leaves at a bend. Nothing is ever left dark
// between them.
//
// Kept as small as will close the worst bend. The seam between two photos
// is a straight diagonal cut — the cross-lines in the sketch — and a
// heavier overlap does not make it cleaner, it just eats more of the photo
// underneath.
const OVERLAP = 0.3;

// Panels rotate to a FRACTION of the path's tangent, not all of it.
//
// This is the lever that makes a non-overlapping ribbon hold together. The
// visible gap at a bend is set by the ANGLE between neighbours, not by the
// spacing: at full tangent, panels at a sharp turn splay apart at their
// outer corners and the strip reads as scattered tiles however small the
// gap is. Damping the rotation keeps every panel nearer upright so
// consecutive edges stay nearly parallel, while their POSITIONS still
// follow the curve exactly — so the band still snakes, it just stops
// coming apart at the joints.
// Full tangent. Damping this was tried and made things worse in a
// different way: panels stayed upright while their POSITIONS still swung
// with the curve, so the band staircased sideways instead of flowing, and
// the notches came back as horizontal steps rather than angular wedges.
// Following the path exactly is what makes the strip read as one band.
const ROTATION_DAMPING = 1;

// How hard a panel shears where the road turns. Driven by curvature, not by
// the tangent, so the distortion happens AT the bends rather than on the
// straights between them.
//
// Gentler than before. While panels overlapped, a heavy shear was hidden by
// its neighbours; standing alone with rounded corners it visibly warps the
// radius, so the effect has to be lighter to stay clean.
const MAX_SKEW_DEGREES = 7;

type SegmentProps = {
  uri: string;
  // This panel's place in the ribbon, 0..1. Added to the shared clock, so
  // the whole strip runs off ONE animation.
  offset: number;
  progress: SharedValue<number>;
  screenWidth: number;
  screenHeight: number;
};

function RoadSegment({ uri, offset, progress, screenWidth, screenHeight }: SegmentProps) {
  const ribbonWidth = screenWidth * RIBBON_WIDTH_RATIO;

  // Slot height, solved so the panels exactly tile the path. The ribbon runs
  // from one slot above the screen to one slot below it, so the strip is cut
  // off by the screen edges rather than ending inside them:
  //   span = screenHeight + 2·slot,  and  slot = span / SEGMENTS
  //   =>  slot = screenHeight / (SEGMENTS - 2)
  const slot = screenHeight / (SEGMENTS - 2);
  const panelHeight = slot * (1 + OVERLAP);
  const span = slot * SEGMENTS;

  const animatedStyle = useAnimatedStyle(() => {
    // Every panel exists at every moment — the ribbon is complete from the
    // first frame, and a panel leaving the bottom re-enters at the top to
    // keep it that way. Nothing fades in or out; the strip simply runs off
    // both edges of the screen.
    const t = (progress.value + offset) % 1;

    const phase = t * TURNS * Math.PI * 2;
    const swing = screenWidth * SWING_RATIO;

    // The path. Centre of this panel, in screen coordinates.
    const x = Math.sin(phase) * swing;
    const y = -slot + t * span;

    // Derivatives of that path with respect to t. dy is constant because
    // the ribbon descends at a steady rate; dx is the sine's derivative.
    const dx = Math.cos(phase) * TURNS * Math.PI * 2 * swing;
    const dy = span;

    // The angle that points the panel's long axis down the path. Rotating
    // a vertical panel by θ sends its "down" direction to (−sinθ, cosθ) in
    // screen coordinates, so matching that to the tangent gives
    // θ = atan2(−dx, dy).
    const angle = ((Math.atan2(-dx, dy) * 180) / Math.PI) * ROTATION_DAMPING;

    // Second derivative: how hard the path is turning here. Peaks at the
    // bends and passes through zero on the straights, which is exactly the
    // behaviour the shear wants.
    const curvature = -Math.sin(phase) * TURNS * TURNS * Math.PI * 2 * (swing / screenWidth);

    return {
      transform: [
        { translateX: x },
        { translateY: y - panelHeight / 2 },
        { rotateZ: `${angle}deg` },
        { skewX: `${curvature * MAX_SKEW_DEGREES}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.segment,
        { width: ribbonWidth, height: panelHeight, marginLeft: -ribbonWidth / 2 },
        animatedStyle,
      ]}
      pointerEvents="none">
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={400}
        cachePolicy="memory-disk"
      />
    </Animated.View>
  );
}

// A continuous ribbon of photos winding down the welcome screen.
//
// Every panel is on screen from the first frame and they stay joined —
// this is one strip cut into pieces, not a stream of separate cards. The
// whole thing scrolls along its own path, and a panel reaching the bottom
// re-enters at the top, which works without breaking the ribbon because the
// panels tile the path evenly.
//
// Reanimated rather than Skia, deliberately. Skia has never worked on this
// project's web target, and a canvas per panel is exactly the GL-surface
// load that repeatedly faulted the host driver — see rating-stamp-svg.tsx.
// Everything here is a transform on a plain View.
//
// Renders nothing without images. The screen behind it is designed to stand
// on its own, so an empty pool is a quieter landing rather than a broken
// one.
export function WelcomeRoad({ images }: { images: string[] }) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);

  useEffect(() => {
    // One clock for the whole ribbon. Linear because the strip moves at a
    // constant speed; easing here would make it surge and stall as a body,
    // which reads as dropped frames rather than as motion.
    progress.value = withRepeat(
      withTiming(1, { duration: TRAVEL_MS, easing: Easing.linear }),
      -1,
      false
    );
  }, [progress]);

  if (images.length === 0) return null;

  // A pool smaller than the ribbon repeats rather than leaving holes — the
  // strip has to be unbroken whatever has been curated into it.
  const segments = Array.from({ length: SEGMENTS }, (_, index) => ({
    uri: images[index % images.length],
    offset: index / SEGMENTS,
  }));

  return (
    <View style={styles.road} pointerEvents="none">
      {segments.map((segment, index) => (
        <RoadSegment
          key={index}
          uri={segment.uri}
          offset={segment.offset}
          progress={progress}
          screenWidth={width}
          screenHeight={height}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  road: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  segment: {
    position: 'absolute',
    left: '50%',
    top: 0,
    // Square, deliberately, now that panels overlap. A rounded corner laid
    // over the next photo reads as one card stacked on another; a straight
    // edge reads as a cut through a single strip, which is what the band
    // needs to look continuous.
    overflow: 'hidden',
  },
});
