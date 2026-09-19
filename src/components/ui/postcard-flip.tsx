import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { usePagerSwipeLock } from '@/hooks/use-tab-pager';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
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
// Coming back from a drag that did not go far enough. Shorter than a full
// turn: nothing has changed, and the card should fall shut rather than
// perform.
const RETURN_MS = 220;
// Without a perspective the rotation is an affine squash — the card gets
// narrower and snaps, instead of a near edge coming toward you. The value is
// in points; smaller is a more extreme lens, and at card width this is about
// where it stops looking like a fisheye.
const PERSPECTIVE = 1200;

// How much of the card's width a drag has to cross to turn it the whole way.
// Less than the full width, because a turn is a flick of the edge rather than
// a haul of the whole card across the screen.
const TRAVEL_SHARE = 0.55;
// How far through that travel the card is committed to turning when released.
// Below half on purpose: at exactly half the card would sit on the knife edge
// and the release would feel like a coin toss.
const COMMIT_AT = 0.38;
// A flick that never got far enough still counts if it was fast.
const FLING_VELOCITY = 500;

// How far sideways the finger has to go before this claims the touch, and how
// far up or down before it gives up on it for good.
//
// This pair is the whole reason a horizontal drag can live inside a vertical
// feed AND on top of a photograph that has its own press. A tap and a drag are
// told apart by MOVEMENT, not by where they start: the pan cannot activate
// until the finger has gone ACTIVATE_X sideways, and a tap does not move. That
// is why the picture's own tap-to-open and double-tap-to-like keep working
// with this attached across the whole card — verified on device, both before
// and after the card became draggable everywhere.
//
// ACTIVATE_X is deliberately well past a tap's jitter rather than at the 10pt
// a pan usually starts at. The finger is now over a photograph that opens when
// pressed, so a sloppy press that drifts a few points must not turn the card
// instead; a drag meant as a drag clears this within the first few frames.
//
// FAIL_Y stays lower than it, which biases a diagonal toward scrolling — the
// right way round in a feed, where scrolling is the gesture being used
// constantly and turning a card is the occasional one.
const ACTIVATE_X = 18;
const FAIL_Y = 10;

// What an edge of the card needs in order to turn it by hand.
//
// Worklets rather than the shared values themselves. An edge could be handed
// `progress` and write to it directly, but then every consumer owns a copy of
// the arithmetic — and React's own lint refuses a mutation of anything that
// came out of useContext, correctly: a context value is not the place to put
// writable state. The turn stays owned here and an edge only reports what the
// finger did.
type FlipControl = {
  // A finger has taken hold of an edge.
  begin: () => void;
  // It has moved this far sideways, in points, since it took hold.
  move: (translationX: number) => void;
  // It has let go. Returns whether that was enough to turn the card — the
  // caller commits, because only it knows which way its own face turns.
  release: (translationX: number, velocityX: number) => boolean;
};

const FlipContext = createContext<FlipControl | null>(null);

type FlipGestureOptions = {
  // Two taps anywhere on the card, edges included.
  onDoubleTap?: () => void;
};

// The gesture that turns the card, for a face to put on its ROOT.
//
// On the root rather than on four edge strips, which is what this used to be.
// Two reasons, and the second is the one that forced it:
//
//  - A drag has to be claimed by the card. The five tabs are a PagerView, so
//    a sideways drag anywhere it is not claimed pages across to Search —
//    confirmed on device, swiping level with a card but off it lands on the
//    search screen.
//  - Both faces are draggable in full, photograph included. That was once
//    restricted to a strip near each edge on the picture side, out of a worry
//    that a drag surface over a photograph would eat its press. It does not:
//    see ACTIVATE_X, the threshold is what separates them.
//
// A pan with an activation offset does not swallow taps, so the photograph
// underneath keeps its own press and double press. The detector goes on the
// card's existing root view rather than an overlay for the same reason: an
// absolutely-filled view on top would be a view on top, and would block them.
//
// Returns null when there is no flip above this — PostcardPaper is used for
// things that do not turn over, and those keep their plain press.
export function useFlipGesture(
  onFlip: (() => void) | undefined,
  { onDoubleTap }: FlipGestureOptions,
) {
  const control = useContext(FlipContext);
  const setPagerLocked = usePagerSwipeLock();

  return useMemo(() => {
    if (control == null || onFlip == null) return null;
    const { begin, move, release } = control;

    // Either direction turns the card. A postcard has no hinge, and guessing
    // which way someone means to sweep is a worse experience than accepting
    // both.
    const pan = Gesture.Pan()
      .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
      .failOffsetY([-FAIL_Y, FAIL_Y])
      .onBegin(() => {
        begin();
        // On touch-DOWN, not on activation. That distinction is the whole fix
        // for iOS: by the time this pan has seen its ACTIVATE_X of travel the
        // pager's own scroll view has already claimed the touch, so waiting
        // until then would be waiting until it is too late. From the first
        // contact with the card the pager is off, and a sideways drag inside
        // a postcard's bounds cannot page across to Search.
        runOnJS(setPagerLocked)(true);
      })
      .onUpdate((e) => {
        move(e.translationX);
      })
      .onEnd((e) => {
        // The commit is the STATE change, not an animation: flipping the prop
        // re-runs the effect below, which carries the turn the rest of the way
        // from wherever the finger left it rather than restarting it.
        if (release(e.translationX, e.velocityX)) runOnJS(onFlip)();
      })
      .onFinalize(() => {
        release(0, 0);
        // onFinalize rather than onEnd, because it is the one that fires for
        // every outcome — the drag completing, the drag failing its offsets
        // and handing the touch back, the gesture being cancelled. A lock
        // released on only the happy path is a lock that eventually sticks,
        // and a stuck one means the tabs stop swiping entirely.
        runOnJS(setPagerLocked)(false);
      });

    if (onDoubleTap == null) return pan;

    // Two taps anywhere on the card, the borders and the written side
    // included — not just on the photograph, which is the only place that
    // used to take them.
    //
    // numberOfTaps(2) never activates on a single tap, so a lone press still
    // reaches whatever is under it: the photograph's own open, a tag, the
    // like button.
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(300)
      .onEnd((_e, success) => {
        if (success) runOnJS(onDoubleTap)();
      });

    return Gesture.Race(pan, doubleTap);
  }, [control, onFlip, onDoubleTap, setPagerLocked]);
}

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

  // Written rather than derived. It used to be a useDerivedValue off
  // `isFlipped`, which recomputes the whole turn from the prop and so cannot
  // be moved by anything else — a finger included. Now the prop drives it
  // through the effect below and the edge gesture drives it directly, and the
  // two meet: a drag leaves progress part way and the commit animates it the
  // rest of the way from there rather than restarting.
  const progress = useSharedValue(isFlipped ? 1 : 0);
  const dragging = useSharedValue(false);
  const width = useSharedValue(0);

  const height = useSharedValue(estimatedHeight);
  // Whether a real measurement has ever landed. The first one has to be a
  // snap: animating from the placeholder estimate to the true height would
  // give every card in the feed a visible settle on mount, which is not a
  // flip and should not look like one.
  const hasMeasured = useRef(false);

  useEffect(() => {
    progress.value = withTiming(isFlipped ? 1 : 0, {
      duration: DURATION_MS,
      // Slight ease-in-out: a linear turn reads mechanical, and a card
      // flipped by hand starts and finishes slowly.
      easing: Easing.inOut(Easing.cubic),
    });
  }, [isFlipped, progress]);

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

  const control = useMemo<FlipControl>(() => {
    const from = isFlipped ? 1 : 0;
    const to = isFlipped ? 0 : 1;
    // How far through the turn a given sideways travel has got.
    const fractionOf = (translationX: number) => {
      'worklet';
      return Math.abs(translationX) / Math.max(width.value * TRAVEL_SHARE, 1);
    };
    return {
      begin: () => {
        'worklet';
        dragging.value = true;
      },
      move: (translationX: number) => {
        'worklet';
        progress.value = from + (to - from) * Math.min(fractionOf(translationX), 1);
      },
      release: (translationX: number, velocityX: number) => {
        'worklet';
        if (!dragging.value) return false;
        dragging.value = false;
        const committed =
          fractionOf(translationX) >= COMMIT_AT || Math.abs(velocityX) >= FLING_VELOCITY;
        if (!committed) {
          progress.value = withTiming(from, {
            duration: RETURN_MS,
            easing: Easing.out(Easing.cubic),
          });
        }
        return committed;
      },
    };
  }, [progress, dragging, width, isFlipped]);

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
    <FlipContext.Provider value={control}>
      <Animated.View
        style={containerStyle}
        onLayout={(e) => {
          width.value = e.nativeEvent.layout.width;
        }}>
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
    </FlipContext.Provider>
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
