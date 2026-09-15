import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandFonts } from '@/constants/theme';
import { randomFor } from '@/lib/seeded-random';

// A cancellation mark: the ring a post office stamps across a card to say
// when it was sent.
//
// It replaced a 72px map square on the written side of the feed card. That
// square was the same failure already rejected once on the picture side —
// at a country's zoom a dark 72px thumbnail is an empty grey box with a pin
// on it, which "could be anywhere" — and the picture side already carries a
// real map, so the back was spending its strongest corner repeating a
// weaker version of it.
//
// A postmark answers the one thing the front does not: when. The address
// lines beside it answer where, and between them the back reads as the back
// of a card rather than as a second copy of the header.

const DEFAULT_SIZE = 76;
// Faded rather than solid: the mark is ink that has already dried into
// paper, and at full cream it competes with the message it sits beside.
const INK = 'rgba(234,231,207,0.55)';
const INK_FAINT = 'rgba(234,231,207,0.34)';

type PostmarkProps = {
  // "SEP 1" — already uppercased by the caller.
  line: string;
  year: string;
  // Per-card tilt. A column of these at identical angles reads as a UI
  // badge; hand-stamped ones never land twice the same way.
  seed: string;
  // Diameter. Smaller where the ring shares a column with a map and a row
  // of stickers rather than heading the column on its own.
  size?: number;
};

export function Postmark({ line, year, seed, size = DEFAULT_SIZE }: PostmarkProps) {
  // The type scales with the ring, or a small stamp sets its date at the
  // same 15px as a large one and simply overruns the inner circle.
  const scale = size / DEFAULT_SIZE;
  const inset = 5 * scale;
  const rotation = useMemo(() => {
    const next = randomFor(`postmark:${seed}`);
    // Always anticlockwise, between about 4° and 15°. Letting it swing
    // both ways made a scrolling feed look unsteady rather than hand-done,
    // and a consistent lean reads as one person stamping with one hand.
    return -(4 + next() * 11);
  }, [seed]);

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, transform: [{ rotate: `${rotation}deg` }] },
      ]}>
      <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
        {/* The second ring is what makes it a cancellation rather than a
            circle — real postmarks are a double annulus with the office and
            the date between them. */}
        <View
          style={[
            styles.innerRing,
            {
              left: inset,
              right: inset,
              top: inset,
              bottom: inset,
              borderRadius: (size - inset * 2) / 2,
            },
          ]}
          pointerEvents="none"
        />
        <ThemedText style={[styles.posted, { fontSize: 7 * scale, lineHeight: 10 * scale }]}>
          POSTED
        </ThemedText>
        <ThemedText style={[styles.date, { fontSize: 15 * scale, lineHeight: 19 * scale }]}>
          {line}
        </ThemedText>
        <ThemedText style={[styles.year, { fontSize: 8 * scale, lineHeight: 12 * scale }]}>
          {year}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  ring: {
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: INK_FAINT,
  },
  // Explicit sizes rather than a ThemedText `type`: nothing in the scale
  // goes this small, and it needs to — three lines have to clear the inner
  // ring's diameter, not the card's.
  posted: {
    fontFamily: BrandFonts.wideMedium,
    letterSpacing: 1,
    color: INK_FAINT,
  },
  date: {
    fontFamily: BrandFonts.roundedStat,
    color: INK,
  },
  year: {
    fontFamily: BrandFonts.wideMedium,
    letterSpacing: 0.6,
    color: INK_FAINT,
  },
});
