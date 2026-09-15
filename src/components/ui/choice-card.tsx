import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InkBlot } from '@/components/ui/ink-blot';
import { StickerArrow } from '@/components/ui/sticker-arrow';
import { BrandColors, Colors, Spacing, StickerAccents } from '@/constants/theme';
import { hashSeed } from '@/lib/seeded-random';
import { buildSurfaceWear } from '@/lib/surface-wear';

type ChoiceCardProps = {
  title: string;
  description: string;
  // Stable per option, so a given card keeps its colour, tilt and wear
  // instead of reshuffling every time the tab is focused.
  seed: string;
  // Which accent this card takes. Given explicitly rather than hashed from
  // the seed: hashing four seeds into six accents collides, and it did —
  // "New review" and "New board" both landed on amber. On a fixed list this
  // short, four distinct colours is a design decision, not something worth
  // leaving to a hash.
  accentIndex: number;
  onPress: () => void;
  // 'navigate' cards go somewhere and carry the sticker arrow. 'select'
  // cards are a radio or a toggle and carry a tick instead — an arrow on a
  // control that stays put is a promise the card does not keep.
  mode?: 'navigate' | 'select';
  selected?: boolean;
  // Sub-options nested under a branch (see review-source). Smaller title, so
  // the tree reads as a tree rather than as more top-level choices.
  compact?: boolean;
};

// A choice in a creation flow, as an object rather than a box.
//
// Shared by the create chooser, "New review"'s source picker and a board's
// ranking picker — all three were the same copy-pasted `optionCard` style:
// identical flat rectangles, the one corner of the app where nothing looked
// hand-placed — everywhere else (arrows, tags,
// rating stamps) is stuck on slightly crooked and slightly worn. Same
// treatment applied here, at card scale: an accent spine, a per-card tilt,
// one light source, a little wear.
//
// Everything is dialled well below what TagSticker does, because the amount
// of character that reads as charming on a 20px chip reads as damage on a
// full-width card. The tilt is under a degree (tags get 2.5), the wear is
// a handful of faint marks rather than up to eight, and there is no die-cut
// cream rim at all — a cream outline around something this big stops being
// a sticker and starts being a border.
const JITTER_DEGREES = 0.7;

// The stub is the torn-off end of a ticket: the arrow or the tick lives in
// it, and a perforation separates it from the body. Wide enough to hold the
// 26px arrow with air around it.
const STUB_WIDTH = 66;
const STUB_WIDTH_COMPACT = 48;
// Half-circles bitten out of the top and bottom edges, on the perforation
// line. Cut with a circle of the PAGE colour rather than with a real path:
// the card already clips to its own rounded rect (overflow:'hidden'), so a
// circle straddling the edge reads as a notch and costs one View. No SVG, no
// Skia surface — the same reasoning that keeps TagSticker off the GPU.
const NOTCH_RADIUS = 9;
// Perforation dots down the tear line, same colour as the notches so the
// whole tear reads as one cut.
const PERF_DOT = 3;

export function ChoiceCard({
  title,
  description,
  seed,
  accentIndex,
  onPress,
  mode = 'navigate',
  selected = false,
  compact = false,
}: ChoiceCardProps) {
  const stubWidth = compact ? STUB_WIDTH_COMPACT : STUB_WIDTH;
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

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        { transform: [{ rotate: `${rotate}deg` }] },
        pressed && styles.pressed,
      ]}>
      {/* The spine carries the card's colour. A left edge rather than a fill
          because the title has to stay cream-on-dark to match every other
          heading in the app — a tinted card would make this the one screen
          with coloured panels. */}
      {/* A selected card widens its own spine rather than changing colour:
          the colour is how you tell the options apart, so it has to survive
          being chosen. */}
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
          card, without anything having to be measured first. */}
      <View
        pointerEvents="none"
        style={[styles.notch, { right: stubWidth - NOTCH_RADIUS, top: -NOTCH_RADIUS }]}
      />
      <View
        pointerEvents="none"
        style={[styles.notch, { right: stubWidth - NOTCH_RADIUS, bottom: -NOTCH_RADIUS }]}
      />
      <View pointerEvents="none" style={[styles.perforation, { right: stubWidth - PERF_DOT / 2 }]}>
        {Array.from({ length: 9 }).map((_, index) => (
          <View key={index} style={styles.perfDot} />
        ))}
      </View>

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

      <View style={[styles.body, compact && styles.bodyCompact, { paddingRight: stubWidth }]}>
        <ThemedText
          type={compact ? 'smallBold' : 'headline'}
          style={[styles.title, compact && styles.titleCompact]}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>

      {/* In the stub, vertically centred against the whole card rather than
          against the title — it belongs to the torn-off end, not to a row. */}
      <View style={[styles.stub, { width: stubWidth }]} pointerEvents="none">
        {mode === 'navigate' ? (
          <StickerArrow direction="right" size={compact ? 20 : 26} seed={`choice:${seed}`} />
        ) : (
          // Always drawn, stamped only when chosen. An empty stub reads as a
          // tear line leading to nothing — the ring is what tells you this
          // card is a choice you have not made yet rather than a decoration.
          <View style={[styles.ring, selected && { borderColor: accent }]}>
            {selected && <InkBlot size={15} seed={`choice-ink:${seed}`} color={accent} />}
          </View>
        )}
      </View>
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
    // Clears the spine, so the heading does not sit on top of it.
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
  ring: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(234,231,207,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    // Metrics live on the `headlineWrapped` type now — see themed-text.tsx.
    flexShrink: 1,
  },
  titleCompact: {
    // The compact title uses `smallBold`, which already carries sane
    // metrics — the 34px headline override must not leak onto it.
    lineHeight: undefined,
  },
});
