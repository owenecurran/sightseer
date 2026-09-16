import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
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
// The picture side. Less, because the frame overlay reaches about 16dp in and
// the picture has to run underneath it — at PAPER_BORDER there would be a
// ring of bare card between the photo and the frame's inner deckle.
export const PAPER_PICTURE_INSET = 10;

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
}: PostcardPaperProps) {
  return (
    <View style={[styles.wrap, style]}>
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
    width: undefined,
    height: undefined,
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: undefined,
    height: undefined,
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
