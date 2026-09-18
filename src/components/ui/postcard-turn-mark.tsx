import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type PostcardTurnMarkProps = {
  onPress: () => void;
  // How far in from the card's own edge the ink sits, in points. The scans
  // have a ragged deckle and a printed border, and a mark set flush to the
  // box would print half on the torn edge.
  inset: number;
  // What the mark is struck in. Defaults to the card's own faded ink, which
  // is right on the picture side and invisible on the written one — that face
  // is a dark panel rather than bare card, and dark ink on it cannot be seen
  // at all. Confirmed by turning a card over and finding nothing there.
  ink?: string;
  // What the card turns to. Read out by a screen reader and nothing else — the
  // printed words are always the same, because they are printing.
  accessibilityLabel?: string;
};

// The card's own "turn over" instruction, printed on it.
//
// Nothing on the front said the card had a back. The flip lives on the card's
// edges, which is a good target and an invisible one: there is no way to look
// at a postcard and know that its border is a control. Everything tried
// instead — a button, a chevron, a pair of dots — reads as app UI sitting on
// top of a postcard, and the whole point of the card is that it is an object
// rather than a screen.
//
// So it is set as PRINTING. Small letterspaced caps in the card's own faded
// ink, in the corner, which is exactly where the real scans already carry
// their printer's marks ("STAB. DALLE NOGARE E ARMETTI - MILANO" runs along
// the foot of one of them). It reads as something the printer put there, not
// as something the app drew, and it is legible for the same reason the
// printer's marks are: it is the only type in that corner.
//
// It is a real target rather than a label for one. The edge strip it sits in
// is 14pt deep at the foot of the card — deliberately shallow, so it does not
// bury the place name's own link — which is too small to aim at. The padding
// and hitSlop here give the mark its own thumb-sized box, so the thing you can
// see is the thing you can press.
export function PostcardTurnMark({
  onPress,
  inset,
  ink = CARD_INK,
  accessibilityLabel,
}: PostcardTurnMarkProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? 'Turn the card over'}
      hitSlop={Spacing.two}
      // The inset is PADDING rather than a position, so the ink moves in off
      // the deckle while the box it can be pressed by stays anchored to the
      // card's corner. Moving the box instead would have taken the target in
      // with it, which is the opposite of the point.
      style={[
        styles.mark,
        {
          paddingRight: Spacing.two + inset,
          paddingBottom: Spacing.one + inset - MOBILE_DROP,
        },
      ]}>
      <View style={styles.row} pointerEvents="none">
        <Ionicons name="arrow-redo" size={9} color={ink} style={styles.glyph} />
        <ThemedText style={[styles.label, { color: ink }]}>TURN OVER</ThemedText>
      </View>
    </Pressable>
  );
}

// The card's own ink, well faded — see visit-card's printedCaptionLine, which
// is the same colour for the same reason. Printing on old card is never black
// by the time it is scanned.
const CARD_INK = 'rgba(28, 34, 24, 0.55)';
// The written side's, for the same mark on a dark panel.
export const TURN_MARK_PANEL_INK = 'rgba(238, 236, 214, 0.45)';

// Dropped this much closer to the foot of the card on a phone.
//
// The border strip the mark sits in is a share of the card, but the type in it
// is a fixed 8pt — so on a small card the ink takes up most of the strip and
// ends up against the bottom edge of the picture, where it is hard to pick
// out. Measured: 28pt of strip with the ink at 17-27, leaving one point of gap
// to the photograph and seventeen of empty cream below it.
//
// NOTE: this is keyed on the PLATFORM because that is how it was asked for,
// but the cause is the card's SIZE — the web build at a phone width has the
// same crowding and will not get this drop. Centring the ink in the strip
// instead would fix both and is a couple of lines; see the call site's `inset`.
const MOBILE_DROP = Platform.OS === 'web' ? 0 : 3;

// Roughly how wide the printed ink is: the glyph, its gap, and "TURN OVER" at
// 8pt with 1.4 of letterspacing. Measured in the browser at 68pt, rounded up.
const TURN_MARK_INK_WIDTH = 72;

// How much room anything else along the foot of the card has to leave on the
// right for this mark. A function of the card rather than a constant, because
// the mark's own inset is a share of the card's width — a fixed number cleared
// the ink by two points at both the sizes it was checked at, which is not
// clearance, it is a coincidence.
export function turnMarkClearance(markInset: number): number {
  return TURN_MARK_INK_WIDTH + markInset;
}

const styles = StyleSheet.create({
  mark: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    // Its own target, not the strip's. See the note above. The right and
    // bottom sides are set at the call site, where the inset is known.
    paddingTop: Spacing.two,
    paddingLeft: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  glyph: {
    // The glyph sits a hair high against letterspaced caps, which have no
    // descenders to balance it.
    marginTop: 1,
  },
  label: {
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 1.4,
  },
});
