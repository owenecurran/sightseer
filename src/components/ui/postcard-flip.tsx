import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

type PostcardFlipProps = {
  isFlipped: boolean;
  front: React.ReactNode;
  back: React.ReactNode;
  // Reserved before either face has measured, so a feed of these does not
  // collapse to nothing on first paint and then shove itself apart.
  estimatedHeight?: number;
};

const DURATION_MS = 460;
// Without a perspective the rotation is an affine squash — the card gets
// narrower and snaps, instead of a near edge coming toward you. The value is
// in points; smaller is a more extreme lens, and at card width this is about
// where it stops looking like a fisheye.
const PERSPECTIVE = 1200;

// A card with two sides that turns over.
//
// Both faces stay mounted and absolutely positioned, which is what makes the
// height solvable: `position:absolute` with left and right pinned still
// leaves height to content, so each face reports its own natural height
// through onLayout, independently of whatever height the container is
// currently showing. Measuring a face by rendering it off-screen first would
// cost a second layout pass per card in a feed that does not virtualize (see
// the note in (tabs)/index.tsx).
//
// The container then animates to WHICHEVER face is showing, rather than
// standing at the taller of the two. Holding the maximum was the first
// attempt and it looked broken: a picture side with a map is roughly twice
// the written side, so turning the card over left a card-and-a-half of empty
// background hanging under three lines of text. Height and turn share one
// duration, so the card changes size as part of the same motion instead of
// resizing afterwards.
//
// The halves are swapped at the midpoint rather than relying on
// backfaceVisibility alone: support for it is uneven across Android versions,
// and a face that stays visible through the back half of the turn shows up
// as a mirrored ghost. Gating each face's opacity on which side is facing the
// viewer is the same effect with no platform question.
export function PostcardFlip({ isFlipped, front, back, estimatedHeight = 260 }: PostcardFlipProps) {
  const [frontHeight, setFrontHeight] = useState(0);
  const [backHeight, setBackHeight] = useState(0);

  const progress = useDerivedValue(() =>
    withTiming(isFlipped ? 1 : 0, {
      duration: DURATION_MS,
      // Slight ease-in-out: a linear turn reads mechanical, and a card
      // flipped by hand starts and finishes slowly.
      easing: Easing.inOut(Easing.cubic),
    }),
  );

  const height = useSharedValue(estimatedHeight);
  // Whether a real measurement has ever landed. The first one has to be a
  // snap: animating from the placeholder estimate to the true height would
  // give every card in the feed a visible settle on mount, which is not a
  // flip and should not look like one.
  const hasMeasured = useRef(false);

  useEffect(() => {
    const measured = isFlipped ? backHeight : frontHeight;
    if (!measured) return;
    if (!hasMeasured.current) {
      hasMeasured.current = true;
      height.value = measured;
      return;
    }
    height.value = withTiming(measured, {
      duration: DURATION_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [isFlipped, frontHeight, backHeight, height]);

  const containerStyle = useAnimatedStyle(() => ({ height: height.value }));

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: PERSPECTIVE },
      { rotateY: `${interpolate(progress.value, [0, 1], [0, 180])}deg` },
    ],
    opacity: progress.value < 0.5 ? 1 : 0,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: PERSPECTIVE },
      { rotateY: `${interpolate(progress.value, [0, 1], [180, 360])}deg` },
    ],
    opacity: progress.value < 0.5 ? 0 : 1,
  }));

  const frontFace = (
    <Animated.View
      key="front"
      style={[styles.face, frontStyle]}
      onLayout={(e) => setFrontHeight(e.nativeEvent.layout.height)}>
      <View pointerEvents={isFlipped ? 'none' : 'auto'}>{front}</View>
    </Animated.View>
  );

  const backFace = (
    <Animated.View
      key="back"
      style={[styles.face, backStyle]}
      onLayout={(e) => setBackHeight(e.nativeEvent.layout.height)}>
      <View pointerEvents={isFlipped ? 'auto' : 'none'}>{back}</View>
    </Animated.View>
  );

  return (
    <Animated.View style={containerStyle}>
      {/* Whichever face is showing is rendered LAST, so it is the one on
          top — and touch follows paint order here. The back used to be
          second unconditionally, which meant that while it was invisible it
          still sat over the front and swallowed every press across the area
          it covered. That hid for a long time because the back is the
          shorter face on a photo card, so the front's only control — the
          turn-over line at its foot — happened to fall below the back's
          bottom edge and worked. Putting a control on the card's border,
          higher up, is what finally surfaced it.
          
          pointerEvents alone does not fix it and was tried three ways on
          device: as a prop on the Animated.View, in its style, and on a
          plain View wrapping each face. None stopped the interception,
          because React Native resolves a touch to the topmost view at the
          point and then walks UP its ancestors — it never falls through to
          a sibling painted underneath. The only reliable fix is for the
          visible face to BE the topmost view. Keys keep both instances
          across the reorder, so nothing remounts when the card turns. */}
      {isFlipped ? [frontFace, backFace] : [backFace, frontFace]}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  face: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    // Deliberately no overflow:'hidden'. The rating stamp leans off this
    // card's corner by design, and clipping here would cut it off — the
    // same trap PaperPanel had to be restructured around.
  },
});
