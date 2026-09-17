import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

type PostcardGrainProps = {
  // Chosen by the caller, because which plate a review carries is stored on
  // the review rather than derived at render time.
  source: ImageSourcePropType;
};

// Dust, scratches and creases over the print.
//
// A scan off real card. The plate is white, carrying the scan's own luminance
// in its alpha — the marks are the opaque part and the rest of the card is
// transparent — so it goes on with ordinary compositing and no blend mode.
//
// It used to be a near-black plate laid on with `mixBlendMode: 'screen'`,
// which is the natural way to read a scan like this: black screens to
// nothing, so only the light marks land. That works on native and is silently
// dropped on the web — react-native-web 0.21.2 has no mixBlendMode at all
// (the property appears nowhere in its dist, and the computed value comes
// back `normal`), so the black plate went on as a flat veil over every
// photograph and over the bare card the picture left. Measured in the
// browser: the cream around a fitted photo came out at 82% of its own
// brightness, which is the grain darkening it by almost exactly its own 0.22.
//
// Baking the blend into the asset removes the dependency instead of working
// around it, and loses nothing: screen(b, s) is b + s*(1 - b), and
// compositing white at alpha s normally gives b*(1 - s) + s — the same
// expression. See write_grain in scripts/build-postcard-assets.py.
//
// If the marks are ever wanted dark rather than light, that is an inversion
// in that same function plus `multiply` here — which would then need a
// web-specific path, since the blend genuinely would be doing work.
//
// It sits over the picture and under the place name: the dust is on the card
// the photograph is printed on, so the photograph catches it — but running
// scratches through display type reads as a rendering fault rather than as
// paper.
export function PostcardGrain({ source }: PostcardGrainProps) {
  return (
    // Wrapped in a View purely to carry pointerEvents. This lies over the
    // whole picture, and an Image rejects the prop outright and ignores it in
    // its style — so left to itself it swallowed every tap meant for the
    // photograph beneath it, and tapping a photo to open it stopped working
    // entirely. On a plain View the prop takes.
    <View style={styles.grain} pointerEvents="none">
      <Image source={source} resizeMode="cover" style={styles.fill} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    // Explicit rather than `undefined`. Leaving them unset works on native,
    // where an absolutely-positioned Image with all four insets stretches to
    // them — but react-native-web applies the ASSET'S OWN intrinsic size to the
    // element, and an undefined width does not clear it. The card scans are
    // 900x583, so every sheet rendered at 900px wide inside a 430px card:
    // measured in the browser, not guessed.
    width: '100%',
    height: '100%',
  },
  grain: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    // The plates are shot dense, and at anything like full strength the
    // scratches read as damage to the screen rather than to the card. This is
    // meant to be felt as the surface not being clean, not spotted as marks
    // laid over a photograph.
    opacity: 0.22,
  },
});
