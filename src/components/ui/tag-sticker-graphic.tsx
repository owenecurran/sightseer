import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, StickerAccents } from '@/constants/theme';
import { svgDataUri } from '@/lib/base64';
import { hashSeed, randomFor } from '@/lib/seeded-random';
import { tagFamily, tagGlyph, type TagFamily } from '@/lib/tag-icons';

const DEFAULT_SIZE = 46;
// The white die-cut margin round the printed face.
const DIE_CUT = 3.2;
// How long the arrow and the name stay up before tidying themselves away.
const REVEAL_MS = 3500;
const INK = '#14201a';
const CUT = '#fbf8ec';

type TagStickerGraphicProps = {
  slug: string;
  label: string;
  // Varies how it is stuck on, per review.
  placementSeed?: string;
  size?: number;
  // Off where something around it handles the tap (choosing tags in the tag
  // picker): no arrow, no page, just the sticker.
  interactive?: boolean;
  // The tag's name printed under it, for where it is being chosen rather
  // than read off a card.
  showLabel?: boolean;
};

// A descriptive tag on the back of a postcard, as a die-cut vinyl sticker:
// its picture printed big on a coloured face, a shape that says what kind of
// tag it is (a circle for scenery, a scalloped badge for atmosphere, a
// starburst for a verdict, and so on), a white margin cut round it, a shadow
// under it, stuck on a little crooked.
//
// No word on it: the picture is the sticker. Tap it once and a hand-drawn
// arrow points at it with its name; tap it again, with the name showing, to
// see other reviews tagged the same way.
export function TagStickerGraphic({
  slug,
  label,
  placementSeed,
  size = DEFAULT_SIZE,
  interactive = true,
  showLabel = false,
}: TagStickerGraphicProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const look = useMemo(() => {
    // The same colour the labelled sticker gives this tag everywhere else.
    const accent = StickerAccents[hashSeed(slug) % StickerAccents.length];
    const random = randomFor(`tag-graphic:${slug}:${placementSeed ?? ''}`);
    return {
      tilt: -9 + random() * 18,
      uri: svgDataUri(stickerSvg(tagFamily(slug), accent, size)),
    };
  }, [slug, placementSeed, size]);

  useEffect(() => {
    if (!isRevealed) return;
    const timer = setTimeout(() => setIsRevealed(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [isRevealed]);

  function handlePress() {
    if (!isRevealed) {
      setIsRevealed(true);
      return;
    }
    setIsRevealed(false);
    router.push({ pathname: '/tag/[slug]', params: { slug } });
  }

  const box = size + DIE_CUT * 2 + 4;
  const sticker = (
    <>
      <Image source={{ uri: look.uri }} style={{ width: box, height: box }} />
      <View style={styles.glyph} pointerEvents="none">
        <Ionicons name={tagGlyph(slug)} size={Math.round(size * 0.5)} color={INK} />
      </View>
    </>
  );

  if (!interactive) {
    return (
      <View style={styles.chosen}>
        <View style={{ width: box, height: box, transform: [{ rotate: `${look.tilt}deg` }] }}>{sticker}</View>
        {showLabel && (
          <ThemedText type="sectionLabel" style={styles.caption} numberOfLines={2}>
            {label.toUpperCase()}
          </ThemedText>
        )}
      </View>
    );
  }

  return (
    <View style={{ width: box, height: box }}>
      <Pressable
        onPress={handlePress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={isRevealed ? `${label}. Tap again for more reviews tagged ${label}` : label}
        style={{ width: box, height: box, transform: [{ rotate: `${look.tilt}deg` }] }}>
        {sticker}
      </Pressable>

      {isRevealed && (
        // Up and to the right of the sticker, written on the card: the name,
        // and an arrow curling down to the sticker.
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(140)}
          pointerEvents="none"
          style={[styles.callout, { left: box * 0.55, bottom: box * 0.55 }]}>
          <ThemedText type="postcardMessage" style={styles.calloutText} numberOfLines={2}>
            {label}
          </ThemedText>
          <Image source={{ uri: ARROW }} style={styles.arrow} />
        </Animated.View>
      )}
    </View>
  );
}

// A hand-drawn arrow, curling from the name down and back to the sticker.
const ARROW = svgDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="34" viewBox="0 0 44 34">` +
    `<path d="M40 4 C 30 3, 18 9, 13 18 C 10 23, 9 26, 8 29" fill="none" stroke="${BrandColors.cream}" ` +
    `stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M3.5 24.5 L8 30.5 L13 25" fill="none" stroke="${BrandColors.cream}" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`,
);

// The sticker: its shadow, the white cut round it, the coloured face, a thin
// printed ring just inside the face's edge, and a gloss over the top.
function stickerSvg(family: TagFamily, accent: string, size: number): string {
  const box = size + DIE_CUT * 2 + 4;
  const c = box / 2 - 1;
  const r = size / 2;
  const face = shapePath(family, c, c, r);
  const ring = shapePath(family, c, c, r - 3.4);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">` +
    `<clipPath id="face"><path d="${face}"/></clipPath>` +
    // Lifted off the card a little: a soft shadow down and to the right.
    `<path d="${face}" transform="translate(1.6 2.2)" fill="rgba(0,0,0,0.32)" stroke="rgba(0,0,0,0.32)" ` +
    `stroke-width="${DIE_CUT * 2}" stroke-linejoin="round"/>` +
    `<path d="${face}" fill="${CUT}" stroke="${CUT}" stroke-width="${DIE_CUT * 2}" stroke-linejoin="round"/>` +
    `<path d="${face}" fill="${accent}"/>` +
    `<path d="${ring}" fill="none" stroke="${INK}" stroke-opacity="0.28" stroke-width="1.1" stroke-dasharray="2.2 1.8"/>` +
    `<g clip-path="url(#face)"><ellipse cx="${c - r * 0.35}" cy="${c - r * 0.55}" rx="${r * 0.85}" ry="${r * 0.45}" ` +
    `fill="#ffffff" fill-opacity="0.22" transform="rotate(-24 ${c} ${c})"/></g>` +
    `</svg>`
  );
}

function polar(cx: number, cy: number, points: number, radiusAt: (angle: number) => number): string {
  let d = '';
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2 - Math.PI / 2;
    const rr = radiusAt(a);
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)} `;
  }
  return `${d}Z`;
}

function shapePath(family: TagFamily, cx: number, cy: number, r: number): string {
  switch (family) {
    case 'scenery':
      return polar(cx, cy, 64, () => r);
    case 'atmosphere':
      // A scalloped badge.
      return polar(cx, cy, 120, (a) => r * (0.93 + 0.07 * Math.cos(a * 12)));
    case 'verdict': {
      // A starburst: sixteen points, alternately out to the edge and in.
      let d = '';
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.8;
        d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)} `;
      }
      return `${d}Z`;
    }
    case 'food':
      return polar(cx, cy, 6, () => r * 1.02);
    case 'people': {
      const k = r * 0.86;
      const q = r * 0.34;
      return (
        `M${cx - k + q} ${cy - k} L${cx + k - q} ${cy - k} Q${cx + k} ${cy - k} ${cx + k} ${cy - k + q} ` +
        `L${cx + k} ${cy + k - q} Q${cx + k} ${cy + k} ${cx + k - q} ${cy + k} L${cx - k + q} ${cy + k} ` +
        `Q${cx - k} ${cy + k} ${cx - k} ${cy + k - q} L${cx - k} ${cy - k + q} Q${cx - k} ${cy - k} ${cx - k + q} ${cy - k} Z`
      );
    }
    case 'practical': {
      // A shield.
      const w = r * 0.9;
      const top = cy - r * 0.92;
      return (
        `M${cx - w} ${top} L${cx + w} ${top} L${cx + w} ${cy} Q${cx + w} ${cy + r * 0.62} ${cx} ${cy + r} ` +
        `Q${cx - w} ${cy + r * 0.62} ${cx - w} ${cy} Z`
      );
    }
  }
}

const styles = StyleSheet.create({
  glyph: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    // The box is a point or so off centre for the shadow; the glyph sits on
    // the face, not the box.
    paddingRight: 2,
    paddingBottom: 2,
  },
  chosen: {
    alignItems: 'center',
    gap: 6,
  },
  // No letterSpacing: with any, Android measured the caption a character
  // short and clipped its last letter ("WATERFRON").
  caption: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  callout: {
    position: 'absolute',
    zIndex: 10,
    // Its own width rather than the sticker's: inside a box the sticker's
    // size, "Night out" came out as "Night ...".
    width: 150,
    alignItems: 'flex-start',
  },
  calloutText: {
    color: BrandColors.cream,
    fontSize: 17,
    lineHeight: 20,
  },
  arrow: {
    width: 44,
    height: 34,
    marginLeft: -36,
    marginTop: -2,
  },
});
