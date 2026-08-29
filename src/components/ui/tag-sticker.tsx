import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

// The same accents the arrow stickers draw from, so a tag stuck on a review
// belongs to the same set of objects as the arrows and stamps around it.
const ACCENTS = ['#a0bd91', '#e0a458', '#c96a5b', '#6b8fb5', '#b58bbd', '#7fae9e'];

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

type TagStickerProps = {
  slug: string;
  label: string;
  // Varies the tilt per review, so the same tag isn't stuck on at an
  // identical angle everywhere it appears. Colour deliberately does NOT use
  // this — see below.
  placementSeed?: string;
  onPress?: () => void;
};

// A descriptive tag on a review, as a die-cut sticker.
//
// Deliberately NOT Skia, unlike the arrow stickers and rating stamps. Those
// each hold a GL surface, which is affordable when there's one per card and
// is not when there are up to three MORE per card: a feed screen would go
// from roughly ten live contexts to forty, which is the load that has
// repeatedly faulted the host OpenGL driver. Everything that makes these
// read as stickers — the cream die-cut rim, the accent fill, the gloss, the
// tilt — is plain layout and a gradient, so this costs nothing on the GPU
// and there is no ceiling on how many can appear.
export function TagSticker({ slug, label, placementSeed, onPress }: TagStickerProps) {
  const { accent, rotate } = useMemo(() => {
    // Colour comes from the SLUG alone, so "Local secret" is the same colour
    // on every review and every place page. That consistency is the point:
    // these exist to be recognised at a glance while sifting, which a colour
    // that reshuffled per review would actively work against.
    const colourHash = hashSeed(slug);
    const tiltHash = hashSeed(`${slug}:${placementSeed ?? ''}`);
    return {
      accent: ACCENTS[colourHash % ACCENTS.length],
      // Mapped from the hash to [-1, 1] rather than a PRNG — one value is
      // needed, not a sequence.
      rotate: ((tiltHash % 1000) / 500 - 1) * JITTER_DEGREES,
    };
  }, [slug, placementSeed]);

  const body = (
    <View
      style={[
        styles.sticker,
        { backgroundColor: accent, transform: [{ rotate: `${rotate}deg` }] },
      ]}>
      {/* Fixed, not rotated with the sticker: a specular highlight comes
          from the light, not the object. Same reasoning as StickerArrow. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0)']}
        locations={[0, 0.5, 0.8]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Dark ink on a mid-tone accent, the same contrast pairing the arrow
          stickers use for their glyph. */}
      <ThemedText type="sectionLabel" style={styles.label}>
        {label}
      </ThemedText>
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
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    // The die-cut rim — the one feature that reads "sticker" rather than
    // "chip" at this size.
    borderWidth: 2,
    borderColor: BrandColors.cream,
    // Clips the gloss to the rounded rim; nothing here needs to overflow.
    overflow: 'hidden',
  },
  label: {
    color: BrandColors.background,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
