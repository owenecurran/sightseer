import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BrandColors, Colors, Spacing, StickerAccents } from '@/constants/theme';
import { hashSeed } from '@/lib/seeded-random';
import { buildSurfaceWear } from '@/lib/surface-wear';

// The ticket: an accent spine, a torn-off stub behind a perforation, one
// light source, a little print wear, and a tilt under a degree.
//
// This was ChoiceCard's body, lifted out whole. It was the only object in the
// app that looked hand-placed at card scale, and it was locked inside the
// creation flow — so a board's contents, a travel book's entries and the
// index of boards themselves were all plain rectangles while the screen that
// CREATED them was tickets. Now there is one ticket and four screens draw it.
//
// Everything is dialled well below what TagSticker does, because the amount
// of character that reads as charming on a 20px chip reads as damage on a
// full-width card. The tilt is under a degree (tags get 2.5), the wear is a
// handful of faint marks rather than up to eight, and there is no die-cut
// cream rim at all — a cream outline around something this big stops being a
// sticker and starts being a border.
const JITTER_DEGREES = 0.7;

// Wide enough to hold a 26px arrow with air around it.
export const TICKET_STUB_WIDTH = 66;
export const TICKET_STUB_WIDTH_COMPACT = 48;

// Half-circles bitten out of the top and bottom edges, on the perforation
// line. Cut with a circle of the PAGE colour rather than with a real path:
// the card already clips to its own rounded rect (overflow:'hidden'), so a
// circle straddling the edge reads as a notch and costs one View. No SVG, no
// Skia surface — the same reasoning that keeps TagSticker off the GPU.
const NOTCH_RADIUS = 9;
// Perforation dots down the tear line, same colour as the notches so the
// whole tear reads as one cut.
const PERF_DOT = 3;

type TicketCardProps = {
  // Stable per row, so a given ticket keeps its colour, tilt and wear instead
  // of reshuffling every time the screen is focused or the list re-sorts.
  seed: string;
  // Which accent the spine takes. Given explicitly rather than hashed from
  // the seed: hashing a handful of seeds into six accents collides, and it
  // did — "New review" and "New board" both landed on amber.
  accentIndex: number;
  children: React.ReactNode;
  // What sits in the torn-off end: an arrow, a tick, a rating stamp. Left out
  // entirely for a ticket with nothing to put there, which then draws no
  // perforation either — a tear line leading to an empty stub reads as a
  // mistake.
  stub?: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  // Applied to the body, beside the space the stub reserves.
  contentStyle?: StyleProp<ViewStyle>;
};

export function TicketCard({
  seed,
  accentIndex,
  children,
  stub,
  onPress,
  selected = false,
  compact = false,
  style,
  contentStyle,
}: TicketCardProps) {
  const stubWidth = stub == null ? 0 : compact ? TICKET_STUB_WIDTH_COMPACT : TICKET_STUB_WIDTH;

  const { accent, rotate, specks, gloss } = useMemo(() => {
    const tiltHash = hashSeed(`${seed}:tilt`);
    // Shared with the review form's panels — see surface-wear.ts.
    const { specks, gloss } = buildSurfaceWear(seed, { maxSize: 5 });

    return {
      accent: StickerAccents[accentIndex % StickerAccents.length],
      rotate: ((tiltHash % 1000) / 500 - 1) * JITTER_DEGREES,
      specks,
      gloss,
    };
  }, [seed, accentIndex]);

  const body = (
    <>
      {/* The spine carries the ticket's colour. A left edge rather than a fill
          because titles have to stay cream-on-dark to match every other
          heading in the app — a tinted card would make this the one screen
          with coloured panels. */}
      {/* A selected ticket widens its own spine rather than changing colour:
          the colour is how you tell them apart, so it has to survive being
          chosen. */}
      <View
        style={[styles.spine, selected && styles.spineSelected, { backgroundColor: accent }]}
      />

      <LinearGradient
        colors={[`rgba(234,231,207,${gloss.peak})`, 'rgba(234,231,207,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: gloss.falloff, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* The tear line: two bites out of the edges with a dotted run between
          them. Positioned from the right so the stub keeps its width on any
          ticket, without anything having to be measured first. */}
      {stub != null && (
        <>
          <View
            pointerEvents="none"
            style={[styles.notch, { right: stubWidth - NOTCH_RADIUS, top: -NOTCH_RADIUS }]}
          />
          <View
            pointerEvents="none"
            style={[styles.notch, { right: stubWidth - NOTCH_RADIUS, bottom: -NOTCH_RADIUS }]}
          />
          <View
            pointerEvents="none"
            style={[styles.perforation, { right: stubWidth - PERF_DOT / 2 }]}>
            {Array.from({ length: 9 }).map((_, index) => (
              <View key={index} style={styles.perfDot} />
            ))}
          </View>
        </>
      )}

      {specks.map((speck, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[
            styles.speck,
            {
              left: speck.left as `${number}%`,
              top: speck.top as `${number}%`,
              width: speck.size,
              height: speck.size,
              borderRadius: speck.size / 2,
              opacity: speck.opacity,
            },
          ]}
        />
      ))}

      <View
        style={[
          styles.body,
          compact && styles.bodyCompact,
          { paddingRight: stubWidth },
          contentStyle,
        ]}>
        {children}
      </View>

      {/* In the stub, vertically centred against the whole ticket rather than
          against a row of text — it belongs to the torn-off end. */}
      {stub != null && (
        <View style={[styles.stub, { width: stubWidth }]} pointerEvents="box-none">
          {stub}
        </View>
      )}
    </>
  );

  // A ticket with nothing to press is still a ticket. Boards' rows wrap
  // themselves in a Swipeable and handle their own press, and nesting a
  // Pressable inside that swallows the swipe.
  if (onPress == null) {
    return (
      <View style={[styles.card, selected && styles.cardSelected, { transform: [{ rotate: `${rotate}deg` }] }, style]}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        { transform: [{ rotate: `${rotate}deg` }] },
        pressed && styles.pressed,
        style,
      ]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    backgroundColor: '#0f2318',
    overflow: 'hidden',
  },
  cardSelected: {
    backgroundColor: Colors.backgroundSelected,
  },
  pressed: {
    opacity: 0.75,
  },
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
  },
  spineSelected: {
    width: 12,
  },
  speck: {
    position: 'absolute',
    backgroundColor: BrandColors.cream,
  },
  body: {
    gap: Spacing.one,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    // Clears the spine, so content does not sit on top of it.
    paddingLeft: Spacing.three + 6,
  },
  bodyCompact: {
    paddingVertical: Spacing.three,
  },
  notch: {
    position: 'absolute',
    width: NOTCH_RADIUS * 2,
    height: NOTCH_RADIUS * 2,
    borderRadius: NOTCH_RADIUS,
    backgroundColor: BrandColors.background,
  },
  perforation: {
    position: 'absolute',
    top: NOTCH_RADIUS,
    bottom: NOTCH_RADIUS,
    width: PERF_DOT,
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  perfDot: {
    width: PERF_DOT,
    height: PERF_DOT,
    borderRadius: PERF_DOT / 2,
    backgroundColor: BrandColors.background,
  },
  stub: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
