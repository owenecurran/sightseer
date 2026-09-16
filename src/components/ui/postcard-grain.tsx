import { Image, StyleSheet, type ImageSourcePropType } from 'react-native';

type PostcardGrainProps = {
  // Chosen by the caller, because which plate a review carries is stored on
  // the review rather than derived at render time.
  source: ImageSourcePropType;
};

// Dust, scratches and creases over the print.
//
// A scan off real card, laid on with a screen blend. The plate is nearly
// black with the marks picked out in light, which is how these are shot and
// is the whole reason the blend has to be `screen`: black screens to nothing,
// so only the marks land. Multiply or darken — the obvious reading of
// "subtract" — would take the card to black, since almost every pixel of the
// plate is black.
//
// If the marks are wanted dark rather than light, that is a one-line change
// in scripts/build-postcard-assets.py (invert the plate on the way out) and
// this switches to `multiply`. The plates themselves do not care.
//
// It sits over the picture and under the place name: the dust is on the card
// the photograph is printed on, so the photograph catches it — but running
// scratches through display type reads as a rendering fault rather than as
// paper.
export function PostcardGrain({ source }: PostcardGrainProps) {
  return (
    <Image
      source={source}
      resizeMode="cover"
      style={styles.grain}
    />
  );
}

const styles = StyleSheet.create({
  grain: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: undefined,
    height: undefined,
    mixBlendMode: 'screen',
    // The plates are shot dense, and at anything like full strength the
    // scratches read as damage to the screen rather than to the card. This is
    // meant to be felt as the surface not being clean, not spotted as marks
    // laid over a photograph.
    opacity: 0.22,
  },
});
