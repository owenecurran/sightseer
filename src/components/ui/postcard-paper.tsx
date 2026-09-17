import { useState } from 'react';
import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { PostcardTurnMark } from '@/components/ui/postcard-turn-mark';
import { BrandColors, Spacing } from '@/constants/theme';
import type { PostcardOrientation } from '@/lib/postcard-orientation';
import type { Sheet } from '@/lib/postcard-stock';

type PostcardPaperProps = {
  // Resolved by the caller rather than picked here: which sheet a review is
  // printed on is stored on the review (see the card_* columns), and the
  // caller is the only thing that knows whether it has one.
  sheet: Sheet;
  children: React.ReactNode;
  style?: ViewStyle;
  // How far the content sits in from the card's edge. The picture side goes
  // in less than the written side, so the frame overlay has picture to land
  // on rather than a gap of bare card.
  inset?: number;
  // Lays the card's own middle-removed copy back over the content — see the
  // note in postcard-stock. Picture side only: the written side has text near
  // the edge that a torn frame would eat into. Ignored on a written sheet,
  // which has no frame to lay.
  framed?: boolean;
  // Rendered after the frame rather than under it. Anything printed ON the
  // card belongs here: the frame is a ring drawn over the card's whole face,
  // and on a portrait sheet its bottom edge is deep enough to cover a caption
  // set in the band below the picture — which is what it did, and which read
  // as the type being clipped rather than as something painted over it.
  footer?: React.ReactNode;
  // Turning the card over.
  onFlip?: () => void;
  flipLabel?: string;
  // Prints the card's own "turn over" mark in the foot of this face. Off by
  // default so a face can opt out — the written side already says what it is,
  // and a card with no other side has nothing to say at all.
  turnMark?: boolean;
  // What that mark is struck in, when the card's own ink is wrong for the
  // face — see PostcardTurnMark's `ink`.
  turnMarkInk?: string;
  // How far in from the card's edge the flip strips reach. The printed border
  // alone is a quarter of a thumb — fine as a visual margin, useless as a
  // target. The picture side sends this well past the border and over the
  // edge of the photo, deliberately: a tap that lands on the outer band of
  // the picture was aiming for the edge of the card. The written side keeps
  // it short, because its content starts close in and a wider strip would sit
  // on top of the like button.
  flipReach?: number;
};

// How far the written side holds its content off the card's edge.
export const PAPER_BORDER = 14;
// How far in from the card's edge its printed marks sit, as a share of the
// card's width. The scans carry a ragged deckle a couple of percent deep and
// their own printer's marks just inside it — this puts ours where theirs are,
// and keeps it there on a card of any size.
const TURN_MARK_INSET_SHARE = 0.035;

// Where that mark's ink starts, for anything else laid along the foot of the
// card that has to stop short of it — see visit-card's bottom-anchored name.
export function turnMarkInsetFor(cardWidth: number): number {
  return Math.round(cardWidth * TURN_MARK_INSET_SHARE);
}

// The picture side's fallback, used only until the card has been measured.
// See pictureInsetFor below, which is what the real inset comes from.
export const PAPER_PICTURE_INSET = 10;

// How far the frame overlay's opaque ring reaches in from the card's edge, as
// a fraction of the card's WIDTH.
//
// Measured off the assets, not guessed: read the alpha channel of all ten
// cardframe-*.png at the widest point of each edge. The ring is a constant
// physical border on a scanned card, which against that card's own width
// comes out at 5.6–7.1% on a landscape sheet and 8.9–11.1% on a portrait one.
// These are the worst case of those, so the heaviest border still clears.
//
// One number covers all four edges because the border is square: a landscape
// card is about 1.5x as wide as it is tall, and 7.1% of its width and 10.7%
// of its height are the same distance. The portrait sheets work out the same
// way the other way up.
//
// The picture is laid in by this much so the frame lands on BARE CARD rather
// than on the photograph. A flat inset cannot do that: the frame is stretched
// to the card, so its reach grows with the card while a fixed 10dp does not —
// the same layout hid about 12dp of the picture's outer band on a phone and
// 32dp on a 750dp-wide desktop card, which is why it only looked broken on a
// big screen.
const FRAME_REACH: Record<PostcardOrientation, number> = {
  horizontal: 0.072,
  vertical: 0.112,
};

// What the picture side holds its content off the card's edge by, for a card
// of a known width. Width alone, deliberately: the card's HEIGHT is derived
// from this inset (the picture box inside it sets it), so measuring against
// height would be circular.
export function pictureInsetFor(cardWidth: number, orientation: PostcardOrientation): number {
  if (cardWidth <= 0) return PAPER_PICTURE_INSET;
  return Math.round(cardWidth * FRAME_REACH[orientation]);
}

// A review printed on a real piece of card.
//
// The sheet is a scan (see postcard-stock), not a generated surface. What was
// here before drew the card: a seeded cream, a scatter of chips around the
// edge to fake wear, a tiled linen weave and a gradient standing in for a
// buckle. Every one of those was a decent approximation on its own and the
// stack of them read as effects rather than as paper. A photograph of the
// real thing has the wear, the weave, the discolouration and the deckle
// already, in agreement with each other.
export function PostcardPaper({
  sheet,
  children,
  style,
  inset = PAPER_BORDER,
  framed = false,
  footer,
  onFlip,
  flipLabel,
  flipReach = PAPER_BORDER,
  turnMark = false,
  turnMarkInk,
}: PostcardPaperProps) {
  // Only the turn-over mark needs this, and only so it can sit the same
  // distance inside the deckle on a phone and on a desktop card.
  const [cardWidth, setCardWidth] = useState(0);

  return (
    <View
      style={[styles.wrap, style]}
      onLayout={turnMark ? (e) => setCardWidth(e.nativeEvent.layout.width) : undefined}>
      {/* Stretched, not cover: the card has to BE the card's shape. Its own
          proportions are close to the frame's already, so the deckle is not
          visibly pulled. */}
      {/* Wrapped in a View purely to carry pointerEvents. An Image rejects the
          prop outright and does not honour it in its style either, so left to
          itself it is a hit-testable view covering the WHOLE card — the frame
          below is drawn over the picture, and it quietly swallowed every tap
          meant for the photograph underneath until the lightbox stopped
          opening at all. On a plain View the prop works. */}
      <View style={styles.sheet} pointerEvents="none">
        <Image source={sheet.card} resizeMode="stretch" style={styles.fill} />
        {/* A wash of the theme's own cream over the sheet, in the sheet's exact
            shape. These are scans of card that spent decades in a drawer, and
            at full strength the foxing and the water marks read as a dirty card
            rather than an old one — but a plain rectangle of cream laid over
            the top would square off the deckle the scan was used for. Tinting a
            second copy of the same image keeps the torn edge and every speck of
            its alpha, and only lifts the colour. */}
        <Image
          source={sheet.card}
          resizeMode="stretch"
          tintColor={BrandColors.cream}
          style={[styles.fill, styles.wash]}
        />
      </View>

      <View style={[styles.body, { padding: inset }]}>{children}</View>

      {framed && (
        <View style={styles.sheet} pointerEvents="none">
          <Image source={sheet.frame} resizeMode="stretch" style={styles.fill} />
          {/* The frame is painted over the content, so it has to be washed
              separately — without this it stays at full grime and reads as a
              dirty border around a clean card. */}
          <Image
            source={sheet.frame}
            resizeMode="stretch"
            tintColor={BrandColors.cream}
            style={[styles.fill, styles.wash]}
          />
        </View>
      )}

      {footer}

      {/* The card's border, as four strips you can actually press. Relying on
          the card's own box to catch what its children did not is not reliable
          here: a tap on the border reached whichever face was painted last
          rather than whichever one was facing you. Four explicit strips are
          unambiguous. */}
      {onFlip &&
        (['left', 'right', 'top', 'bottom'] as const).map((edge) => (
          <Pressable
            key={edge}
            onPress={onFlip}
            accessibilityRole="button"
            accessibilityLabel={flipLabel}
            style={[styles.edge, edgeStyle(edge, flipReach)]}
          />
        ))}

      {/* Last, so its own thumb-sized target sits over the shallow strip the
          foot of the card leaves — both turn the card, but this one is the
          one that can be aimed at. */}
      {onFlip && turnMark && (
        <PostcardTurnMark
          onPress={onFlip}
          inset={turnMarkInsetFor(cardWidth)}
          ink={turnMarkInk}
          accessibilityLabel={flipLabel}
        />
      )}
    </View>
  );
}

function edgeStyle(edge: 'left' | 'right' | 'top' | 'bottom', reach: number): ViewStyle {
  switch (edge) {
    case 'left':
      return { left: 0, top: 0, bottom: 0, width: reach };
    case 'right':
      return { right: 0, top: 0, bottom: 0, width: reach };
    case 'top':
      return { left: 0, right: 0, top: 0, height: reach };
    // The foot of the card never reaches in past its own border: that is
    // where the place name and its line sit, and burying the name's own link
    // under a flip target would cost a real destination to save a gesture
    // that three other edges already offer.
    case 'bottom':
      return { left: 0, right: 0, bottom: 0, height: PAPER_BORDER };
  }
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  // Both the sheet behind and the frame in front fill the card exactly, which
  // is what keeps the frame's grain registered with the sheet's — they are
  // the same scan.
  //
  // Touch-transparent, and every one of the four shares this. They are paper,
  // not controls, but an Image is a hit-testable view like any other and these
  // cover the WHOLE card — the frame and its wash are drawn OVER the picture,
  // so without this they quietly swallowed every tap meant for the photograph
  // underneath and the lightbox stopped opening at all. The flip strips kept
  // working the whole time, because they are rendered after these and sit on
  // top of them, which is exactly why the symptom looked like "only the flip
  // works" rather than like a dead card.
  //
  // In the STYLE, not as a prop: Image rejects a pointerEvents prop outright.
  sheet: {
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
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    // Same reason as above.
    width: '100%',
    height: '100%',
  },
  // Strong enough to take the grime back to something that reads as aged
  // paper, light enough that the foxing and the printed rules are still
  // visible under it.
  wash: {
    opacity: 0.5,
  },
  body: {
    gap: Spacing.two,
  },
  edge: {
    position: 'absolute',
  },
});
