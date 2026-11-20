import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, StickerAccents } from '@/constants/theme';
import { randomFor } from '@/lib/seeded-random';
import { tagIcon } from '@/lib/tag-icons';


// Hand-applied stickers are never quite square to what they're stuck on.
// Smaller than the arrows' jitter — these sit inline in a row of text, where
// a big tilt reads as broken rather than as deliberate.
const JITTER_DEGREES = 2.5;

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Speck = {
  left: string;
  top: string;
  // Width and height are drawn independently, so a mark can be a round
  // fleck, an oval, or a short sliver. Uniform circles read as deliberate
  // dots -- a printed pattern rather than damage.
  width: number;
  height: number;
  radius: number;
  angle: number;
  opacity: number;
  dark: boolean;
};

type Scratch = {
  left: string;
  top: string;
  width: number;
  angle: number;
  opacity: number;
};

type TagStickerProps = {
  slug: string;
  label: string;
  // Varies the tilt, the wear and the sheen per review, so the same tag is
  // not stuck on identically everywhere it appears. Colour deliberately
  // does NOT use this — see below.
  placementSeed?: string;
  onPress?: () => void;
  // 'small' is the sticker as it sits on a postcard, where three of them
  // share the written side with the message and must stay out of its way.
  // 'large' is the same sticker held up to be chosen -- the review form and
  // the tag sheet, where it is the thing being picked rather than a detail
  // on a card, and at 9pt it read as fine print.
  size?: 'small' | 'large';
  // Fill the parent instead of hugging the word, with the label centred.
  // For a grid of tags: a sticker sized to its word floats small in a big
  // cell when the word is short, and when the word is long enough to wrap it
  // takes the full width anyway (a wrapping Text is as wide as its container,
  // not as its longest line) -- so the grid came out half tiny stickers and
  // half wall-to-wall ones. Filling every cell makes them one size.
  block?: boolean;
};

// A descriptive tag on a review, as a die-cut sticker.
//
// Deliberately NOT Skia, unlike the arrow stickers and rating stamps. Those
// each hold a GL surface, which is affordable when there's one per card and
// is not when there are up to three MORE per card: a feed screen would go
// from roughly ten live contexts to forty, which is the load that has
// repeatedly faulted the host OpenGL driver. Everything that makes these
// read as stickers — the cream die-cut rim, the accent fill, the gloss, the
// tilt, the wear — is plain layout and one gradient, so this costs nothing
// on the GPU and there is no ceiling on how many can appear.
//
// The wear is built from positioned Views rather than the SVG geometry the
// rating stamps use, because there is no SVG here to put shapes into. Marks
// are placed in PERCENTAGES of the sticker, so nothing has to measure it
// first — these size themselves to their label and a measurement pass would
// mean a visible pop.
export function TagSticker({ slug, label, placementSeed, onPress, size = 'small', block = false }: TagStickerProps) {
  const { accent, rotate, specks, scratch, gloss } = useMemo(() => {
    // Colour comes from the SLUG alone, so "Local secret" is the same colour
    // on every review and every place page. That consistency is the point:
    // these exist to be recognised at a glance while sifting, which a colour
    // that reshuffled per review would actively work against.
    const colourHash = hashSeed(slug);
    const tiltHash = hashSeed(`${slug}:${placementSeed ?? ''}`);

    // A separate stream for wear and sheen, so adding or tuning either
    // cannot shift the colour or the tilt — both of which are derived from
    // the hashes above exactly as they were before any of this existed.
    const next = randomFor(`sticker-wear:${slug}:${placementSeed ?? ''}`);

    // Squared for the spread, so a battered sticker stays uncommon — but
    // lifted off zero, unlike the rating stamps' wear. A stamp is 50-110px
    // and can carry a nearly-mint state legibly; these are ~20px tall, and
    // at that size "lightly worn" rendered as nothing at all (checked at 3x
    // magnification: two specks, invisible in the feed). The floor is what
    // makes the effect exist on every sticker rather than only the
    // worst-drawn few.
    const wear = 0.3 + next() ** 2 * 0.7;

    const speckList: Speck[] = [];
    const speckCount = Math.round(2 + wear * 6);
    for (let i = 0; i < speckCount; i++) {
      const width = 2 + next() * 4;
      const height = 1.5 + next() * 3;
      const dark = next() < 0.4;
      speckList.push({
        left: `${Math.round(next() * 92)}%`,
        top: `${Math.round(next() * 80)}%`,
        width,
        height,
        // Half the short side is a circle or a pill; a little under that is
        // a soft-cornered flake. The floor stays high on purpose -- at 0.18
        // the marks came out as visibly square-cornered rectangles, which
        // read as rendering artefacts rather than as damage. The variety
        // that matters comes from width and height differing, not from
        // sharpening the corners.
        radius: Math.min(width, height) * (0.34 + next() * 0.16),
        // Only meaningful once a mark is oblong, which is the point of
        // drawing the two sides separately.
        angle: next() * 180,
        // Dark marks are held well below the light ones. On a mid-tone
        // accent a dark speck reads as a hole punched in the sticker, where
        // the same value in cream reads as the print having lifted --
        // which is the effect wanted.
        opacity: dark ? 0.06 + next() * 0.11 : 0.1 + next() * 0.2,
        dark,
      });
    }

    // At most one, and only on a sticker already showing some wear —
    // a scratch across an otherwise pristine sticker reads as a rendering
    // artefact rather than as damage.
    const scratchLine: Scratch | null =
      wear > 0.55 && next() < 0.75
        ? {
            left: `${Math.round(next() * 55)}%`,
            top: `${Math.round(20 + next() * 55)}%`,
            width: 10 + next() * 28,
            angle: -35 + next() * 70,
            opacity: 0.14 + next() * 0.18,
          }
        : null;

    return {
      accent: StickerAccents[colourHash % StickerAccents.length],
      // Mapped from the hash to [-1, 1] rather than a PRNG — one value is
      // needed, not a sequence.
      rotate: ((tiltHash % 1000) / 500 - 1) * JITTER_DEGREES,
      specks: speckList,
      scratch: scratchLine,
      gloss: {
        // How bright the highlight peaks, and how far across the sticker it
        // survives before fading out. Varying these rather than the ANGLE
        // is deliberate: the light is the same for every sticker on the
        // card, so a per-sticker light direction would look wrong. What
        // genuinely differs is how flat each one is stuck down, which
        // changes how strongly and how far it catches that one light.
        peak: 0.3 + next() * 0.28,
        mid: 0.06 + next() * 0.12,
        falloff: 0.6 + next() * 0.3,
        // A small angular wobble, well under the tilt jitter — enough to
        // stop a row of stickers sharing one identical sheen, not enough to
        // read as separate light sources.
        skew: (next() - 0.5) * 0.16,
      },
    };
  }, [slug, placementSeed]);

  const body = (
    <View
      style={[
        styles.sticker,
        size === 'large' && styles.stickerLarge,
        block && styles.stickerBlock,
        { backgroundColor: accent, transform: [{ rotate: `${rotate}deg` }] },
      ]}>
      {/* Fixed, not rotated with the sticker: a specular highlight comes
          from the light, not the object. Same reasoning as StickerArrow. */}
      <LinearGradient
        colors={[
          `rgba(255,255,255,${gloss.peak})`,
          `rgba(255,255,255,${gloss.mid})`,
          'rgba(255,255,255,0)',
        ]}
        locations={[0, 0.5, gloss.falloff]}
        start={{ x: 0.1 + gloss.skew, y: 0 }}
        end={{ x: 0.9 + gloss.skew, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Wear sits over the gloss but UNDER the label. Physically the
          damage is on top of everything, but these are small and exist to
          be read while sifting — scuffs across the text cost more than the
          realism buys. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {specks.map((speck, index) => (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: speck.left as `${number}%`,
              top: speck.top as `${number}%`,
              width: speck.width,
              height: speck.height,
              borderRadius: speck.radius,
              backgroundColor: speck.dark ? BrandColors.background : BrandColors.cream,
              opacity: speck.opacity,
              transform: [{ rotate: `${speck.angle}deg` }],
            }}
          />
        ))}
        {scratch && (
          <View
            style={{
              position: 'absolute',
              left: scratch.left as `${number}%`,
              top: scratch.top as `${number}%`,
              width: scratch.width,
              height: 1,
              backgroundColor: BrandColors.cream,
              opacity: scratch.opacity,
              transform: [{ rotate: `${scratch.angle}deg` }],
            }}
          />
        )}
      </View>

      {/* Dark ink on a mid-tone accent, the same contrast pairing the arrow
          stickers use for their glyph. The picture first, printed in the
          same ink, so a tag is known by its mark before its word is read. */}
      <View style={[styles.face, size === 'large' && styles.faceLarge]}>
        <Ionicons name={tagIcon(slug)} size={size === 'large' ? 15 : 10} color={BrandColors.background} />
        <ThemedText
          type="sectionLabel"
          style={[styles.label, size === 'large' && styles.labelLarge, block && styles.labelBlock]}>
          {label}
        </ThemedText>
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sticker: {
    // Tight. These were set at the padding a tappable chip wants, and on a
    // card they read as buttons rather than as something stuck on — three of
    // them took most of the written side. A sticker is small.
    paddingVertical: 1,
    paddingHorizontal: Spacing.one + 1,
    borderRadius: Spacing.one,
    // The die-cut rim — the one feature that reads "sticker" rather than
    // "chip" at this size.
    borderWidth: 1.5,
    borderColor: BrandColors.cream,
    // Clips the gloss and the wear marks to the rounded rim; nothing here
    // needs to overflow.
    overflow: 'hidden',
  },
  // Everything scaled together -- rim, corner, padding and type -- so the
  // large sticker is the same object closer up rather than the small one
  // with a bigger word in it.
  stickerLarge: {
    paddingVertical: 5,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Spacing.two,
    borderWidth: 2,
  },
  labelLarge: {
    // 13 rather than 14, which is the line between fitting and not: this
    // face is about an em per capital, and at 14 "WATERFRONT" needed ~147dp
    // in a half-width grid cell that had ~142, so it broke as "WATERFRON /
    // T". The longest single words in the vocabulary (SPECIALITIES,
    // KID-FRIENDLY, WATERFRONT) all fit whole at 13.
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 0.4,
  },
  stickerBlock: {
    // Both ways: across the cell, and down to the height of the tallest
    // sticker in its row, so a one-line tag beside a two-line one is the
    // same size rather than a short strip next to a block.
    alignSelf: 'stretch',
    flexGrow: 1,
    justifyContent: 'center',
    // Half the padding the free-standing large sticker gets. A grid cell is
    // only ~174dp, and every point of padding comes out of the label:
    // "PET-FRIENDLY" broke as "PET-FRIENDL / Y" at a full Spacing.two each
    // side, the one label of forty-four that did. The rim and the tilt
    // still read as a sticker with this much less air inside it.
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.two,
  },
  labelBlock: {
    textAlign: 'center',
  },
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  faceLarge: {
    gap: Spacing.one + 1,
  },
  label: {
    // Shrinks beside the icon, so a long word wraps rather than pushing the
    // sticker past its cell.
    flexShrink: 1,
    color: BrandColors.background,
    textTransform: 'uppercase',
    // Down from sectionLabel's own 12, which is a heading size and was
    // carrying the sticker's width with it.
    fontSize: 9,
    lineHeight: 13,
    letterSpacing: 0.4,
  },
});
