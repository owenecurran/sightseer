import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, BrandFonts, StickerAccents } from '@/constants/theme';
import { svgDataUri } from '@/lib/base64';
import { hashSeed, pickFor, randomFor } from '@/lib/seeded-random';
import { tagFamily, tagGlyph, tagSlogan, type TagFamily } from '@/lib/tag-icons';

const DEFAULT_SIZE = 50;
// The white die-cut margin round the sticker, at its widest. Each copy is
// cut a little differently, never wider than this.
const DIE_CUT = 4;
// How long the arrow and the name stay up before tidying themselves away.
const REVEAL_MS = 3500;
const CREAM = '#f6f1df';
// A stamp's inner ring, and the middle of the band between it and the rim,
// where the words run: as shares of the stamp's radius.
const STAMP_INNER = 0.46;
const STAMP_BAND = 0.66;

// The sticker's colours, chosen together. Each set is built round one of the
// app's six accents, and a tag takes the set whose main colour is its own
// accent: the colour its labelled sticker has everywhere else.
type Palette = {
  face: string;
  // The face's own darker shade, for the decoration printed on it.
  shade: string;
  ribbon: string;
  // The ribbon's back, seen in its folded tails.
  ribbonBack: string;
  // The outline round everything, and the shadow under the picture: a deep
  // version of the face rather than black.
  ink: string;
};

const PALETTES: Record<string, Palette> = {
  // Sage, with a terracotta banner.
  '#a0bd91': { face: '#a0bd91', shade: '#86a576', ribbon: '#c96a5b', ribbonBack: '#9c4b3e', ink: '#24392a' },
  // Amber, with terracotta.
  '#e0a458': { face: '#e0a458', shade: '#c88a3c', ribbon: '#c96a5b', ribbonBack: '#9c4b3e', ink: '#4a2a14' },
  // Terracotta, with slate blue.
  '#c96a5b': { face: '#c96a5b', shade: '#ad5243', ribbon: '#6b8fb5', ribbonBack: '#4d6d91', ink: '#3d1a14' },
  // Slate blue, with amber.
  '#6b8fb5': { face: '#6b8fb5', shade: '#557797', ribbon: '#e0a458', ribbonBack: '#b9813a', ink: '#1c2c42' },
  // Plum, with teal.
  '#b58bbd': { face: '#b58bbd', shade: '#98709f', ribbon: '#7fae9e', ribbonBack: '#5c8a7b', ink: '#3a2140' },
  // Teal, with amber.
  '#7fae9e': { face: '#7fae9e', shade: '#64927f', ribbon: '#e0a458', ribbonBack: '#b9813a', ink: '#1d3a31' },
};

// The kinds of sticker, as on a real sheet: some are a word and nothing
// else. A tag is always the same kind, and the kinds are spread through the
// tags so the stickers on one card are a mix.
type StickerKind = 'lettering' | 'stamp' | 'label' | 'badge';
const KINDS: StickerKind[] = ['lettering', 'stamp', 'label', 'badge'];

// What a badge has printed behind its picture, in its own colours.
type Decoration = 'rays' | 'sparkles' | 'stripes' | 'halftone' | 'ring' | 'plain';
const DECORATIONS: Decoration[] = ['rays', 'sparkles', 'stripes', 'halftone', 'ring', 'plain'];

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

// A descriptive tag on the back of a postcard, as a sticker off a sheet.
// Four kinds, all in the tag's own set of colours:
//
// - lettering: the word itself, cut out of vinyl, outlined, with the white
//   die-cut margin following the letters;
// - stamp: a round rubber stamp, the word run round its rim in worn ink and
//   the tag's picture in the middle;
// - label: an oval label with the word in the postcards' serif;
// - badge: a shaped badge with the picture alone, on a printed pattern.
//
// Tap one and a hand-drawn arrow points at it with the tag's full name; tap
// again, with the name showing, to see other reviews tagged the same way.
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
    const hash = hashSeed(slug);
    const accent = StickerAccents[hash % StickerAccents.length];
    const random = randomFor(`tag-graphic:${slug}:${placementSeed ?? ''}`);
    return {
      // Drawn rather than taken from bits of the hash: `>>` is a signed
      // shift, and for half the tags it went negative and indexed nothing.
      kind: pickFor(`sticker-kind:${slug}`, KINDS) ?? 'badge',
      palette: PALETTES[accent] ?? PALETTES['#a0bd91'],
      decoration: pickFor(`sticker-decoration:${slug}`, DECORATIONS) ?? 'plain',
      family: tagFamily(slug),
      word: tagSlogan(slug, label),
      tilt: -7 + random() * 14,
      cut: 2.8 + random() * (DIE_CUT - 2.8),
      peelAt: random() < 0.3 ? Math.PI * (0.15 + random() * 0.3) * (random() < 0.5 ? 1 : 3) : null,
      wearSeed: `${slug}:${placementSeed ?? ''}`,
    };
  }, [slug, label, placementSeed]);

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

  const box = Math.round(size * 1.3 + DIE_CUT * 2);
  const sticker = <StickerFace look={look} slug={slug} size={size} box={box} />;

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

type Look = {
  kind: StickerKind;
  palette: Palette;
  decoration: Decoration;
  family: TagFamily;
  word: string;
  cut: number;
  peelAt: number | null;
  wearSeed: string;
};

function StickerFace({ look, slug, size, box }: { look: Look; slug: string; size: number; box: number }) {
  const { kind, palette, decoration, family, word, cut, peelAt, wearSeed } = look;
  const c = box / 2;
  const r = size / 2;
  const drawn = useMemo(() => {
    switch (kind) {
      case 'stamp':
        return { base: svgDataUri(stampSvg(palette, box, r, cut)), wear: svgDataUri(stampWearSvg(box, r, wearSeed)) };
      case 'label':
        return { base: svgDataUri(labelSvg(palette, box, r, cut)), wear: null };
      case 'badge':
        return { base: svgDataUri(badgeSvg(family, palette, decoration, box, r, cut, peelAt)), wear: null };
      case 'lettering':
        return { base: null, wear: null };
    }
  }, [kind, palette, decoration, family, box, r, cut, peelAt, wearSeed]);

  let printed: ReactNode = null;
  switch (kind) {
    case 'lettering':
      printed = <Lettering word={word} palette={palette} box={box} cut={cut} />;
      break;
    case 'stamp':
      printed = (
        <>
          <ArcText text={word.toUpperCase()} c={c} radius={r * STAMP_BAND} r={r} color={palette.shade} />
          <View style={[styles.centred, { top: c - r * 0.3, height: r * 0.6 }]}>
            <Ionicons name={tagGlyph(slug)} size={Math.round(r * 0.62)} color={palette.shade} />
          </View>
        </>
      );
      break;
    case 'label': {
      const height = r * 1.1;
      const width = box - cut * 2 - 6;
      const fontSize = Math.min(height * 0.42, (width - 16) / (word.length * 0.5));
      printed = (
        <View style={[styles.centred, { top: c - height / 2, height, paddingHorizontal: 10 }]}>
          <Text style={[styles.labelText, { color: palette.ink, fontSize, lineHeight: fontSize * 1.15 }]} numberOfLines={1}>
            {word}
          </Text>
        </View>
      );
      break;
    }
    case 'badge': {
      const glyph = Math.round(r * 0.9);
      printed = (
        <View style={[styles.centred, { top: c - glyph / 2, height: glyph }]}>
          {/* Cream, over a copy in the outline's tone set a little down and
              right: a two-colour print landing slightly out of register. */}
          <Ionicons name={tagGlyph(slug)} size={glyph} color={palette.ink} style={styles.offsetCopy} />
          <Ionicons name={tagGlyph(slug)} size={glyph} color={CREAM} />
        </View>
      );
      break;
    }
  }

  return (
    <View style={{ width: box, height: box }} pointerEvents="none">
      {drawn.base && <Image source={{ uri: drawn.base }} style={{ width: box, height: box }} />}
      {printed}
      {drawn.wear && <Image source={{ uri: drawn.wear }} style={[StyleSheet.absoluteFill, { width: box, height: box }]} />}
    </View>
  );
}

// Offsets round a circle, for building an outline out of copies of the same
// word: React Native text takes one shadow, so a thick edge has to be made
// of several copies laid round it (see RegionLine).
function ring(radius: number, steps: number): { dx: number; dy: number }[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return { dx: Math.cos(a) * radius, dy: Math.sin(a) * radius };
  });
}

// The word cut out of vinyl: the letters in the tag's colour, a second
// colour knocked out behind them a little down and right, a dark edge, and
// the white die-cut margin following the letters' own shape.
function Lettering({ word, palette, box, cut }: { word: string; palette: Palette; box: number; cut: number }) {
  const text = splitWord(word.toUpperCase());
  const longest = Math.max(...text.split('\n').map((line) => line.length));
  const lines = text.split('\n').length;
  const room = box - (cut + 3) * 2;
  // The heavy face runs to about 0.74 of an em a capital. At less, the
  // words came out too big for their sticker and broke ("PEA / KS").
  const fontSize = Math.min(box * 0.34, room / (longest * 0.74), (room * 0.9) / (lines * 0.95));
  const lineHeight = fontSize * 0.95;
  const layer = (color: string, dx: number, dy: number, key: string) => (
    <Text
      key={key}
      numberOfLines={lines}
      style={[
        styles.lettering,
        // Wider than the sticker, so a word can never wrap inside it: the
        // size above is what keeps it on the sticker.
        { color, fontSize, lineHeight, width: box * 1.6, transform: [{ translateX: dx }, { translateY: dy }] },
      ]}>
      {text}
    </Text>
  );
  const cutRing = [...ring(cut, 12), ...ring(cut * 0.55, 8)];
  return (
    <View style={[StyleSheet.absoluteFill, styles.centredBox]}>
      {/* Its shadow on the card, under the cut. */}
      {ring(cut, 8).map(({ dx, dy }, i) => layer('rgba(0,0,0,0.12)', dx + 1.4, dy + 2, `shadow-${i}`))}
      {cutRing.map(({ dx, dy }, i) => layer(CREAM, dx, dy, `cut-${i}`))}
      {ring(1.3, 8).map(({ dx, dy }, i) => layer(palette.ink, dx, dy, `edge-${i}`))}
      {layer(palette.ribbon, 1.6, 1.6, 'drop')}
      {layer(palette.face, 0, 0, 'face')}
    </View>
  );
}

// Onto two lines at the space nearest the middle, for a word of two parts
// long enough to want it.
function splitWord(word: string): string {
  if (!word.includes(' ') || word.length <= 6) return word;
  const middle = word.length / 2;
  let best = -1;
  for (let i = 0; i < word.length; i++) {
    if (word[i] === ' ' && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle))) best = i;
  }
  return `${word.slice(0, best)}\n${word.slice(best + 1)}`;
}

// Letters run round the top of a circle, each turned to face out, the way a
// rubber stamp sets its words round the rim.
function ArcText({ text, c, radius, r, color }: { text: string; c: number; radius: number; r: number; color: string }) {
  // As large as fits the band between the stamp's two rings, and the top
  // arc's length. The heavy face is about 0.78 of an em to a letter with
  // the room between; tighter than that and the letters ran into each other.
  const fontSize = Math.min(r * 0.3, (radius * 3) / (text.length * 0.78));
  const advance = fontSize * 0.78;
  const step = advance / radius;
  const total = step * (text.length - 1);
  const width = fontSize;
  const height = fontSize * 1.2;
  return (
    <>
      {text.split('').map((char, i) => {
        const angle = -total / 2 + i * step;
        return (
          <Text
            key={i}
            style={[
              styles.arcChar,
              {
                left: c - width / 2,
                top: c - radius - height / 2,
                width,
                height,
                fontSize,
                lineHeight: height,
                color,
                transformOrigin: [width / 2, radius + height / 2, 0],
                transform: [{ rotate: `${angle}rad` }],
              },
            ]}>
            {char}
          </Text>
        );
      })}
    </>
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

function svgOpen(box: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">`;
}

// A shape's shadow on the card and its white die-cut margin.
function cutAndShadow(shape: string, cut: number): string {
  return (
    `<g transform="translate(1.6 2.2)" fill="rgba(0,0,0,0.3)" stroke="rgba(0,0,0,0.3)" stroke-width="${(cut * 2).toFixed(1)}" stroke-linejoin="round">${shape}</g>` +
    `<g fill="${CREAM}" stroke="${CREAM}" stroke-width="${(cut * 2).toFixed(1)}" stroke-linejoin="round">${shape}</g>`
  );
}

// A rubber stamp: cream, a heavy rim and a fine inner ring in the stamp's
// ink, and three dots along the bottom where the words do not reach.
function stampSvg(palette: Palette, box: number, r: number, cut: number): string {
  const c = box / 2;
  const dots = [-0.32, 0, 0.32]
    .map((a) => {
      const angle = Math.PI / 2 + a;
      return `<circle cx="${(c + Math.cos(angle) * r * STAMP_BAND).toFixed(1)}" cy="${(c + Math.sin(angle) * r * STAMP_BAND).toFixed(1)}" r="${(r * 0.06).toFixed(2)}" fill="${palette.shade}"/>`;
    })
    .join('');
  return (
    svgOpen(box) +
    cutAndShadow(`<circle cx="${c}" cy="${c}" r="${r}"/>`, cut) +
    `<circle cx="${c}" cy="${c}" r="${r - 2.4}" fill="none" stroke="${palette.shade}" stroke-width="2.6"/>` +
    `<circle cx="${c}" cy="${c}" r="${r * STAMP_INNER}" fill="none" stroke="${palette.shade}" stroke-width="1"/>` +
    dots +
    `</svg>`
  );
}

// Where the stamp's ink did not take: flecks of the paper showing through,
// laid over the rim, the words and the picture alike.
function stampWearSvg(box: number, r: number, seed: string): string {
  const random = randomFor(`stamp-wear:${seed}`);
  const c = box / 2;
  let flecks = '';
  for (let i = 0; i < 34; i++) {
    const a = random() * Math.PI * 2;
    const d = Math.sqrt(random()) * r * 0.98;
    flecks += `<circle cx="${(c + Math.cos(a) * d).toFixed(1)}" cy="${(c + Math.sin(a) * d).toFixed(1)}" r="${(0.35 + random() * 0.8).toFixed(2)}" fill="${CREAM}"/>`;
  }
  // A pale streak where the stamp came down unevenly.
  const sa = random() * Math.PI * 2;
  flecks +=
    `<path d="M${(c + Math.cos(sa) * r * 0.9).toFixed(1)} ${(c + Math.sin(sa) * r * 0.9).toFixed(1)} ` +
    `A${r * 0.9} ${r * 0.9} 0 0 1 ${(c + Math.cos(sa + 0.7) * r * 0.9).toFixed(1)} ${(c + Math.sin(sa + 0.7) * r * 0.9).toFixed(1)}" ` +
    `fill="none" stroke="${CREAM}" stroke-opacity="0.55" stroke-width="2.2"/>`;
  return svgOpen(box) + flecks + `</svg>`;
}

// An oval label: cream, a thick border in the tag's colour, a fine keyline
// inside it, and a dot at each end.
function labelSvg(palette: Palette, box: number, r: number, cut: number): string {
  const c = box / 2;
  const height = r * 1.1;
  const width = box - cut * 2 - 6;
  const x = c - width / 2;
  const y = c - height / 2;
  const pill = (inset: number) =>
    `<rect x="${x + inset}" y="${y + inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${(height - inset * 2) / 2}"`;
  return (
    svgOpen(box) +
    cutAndShadow(`${pill(0)}/>`, cut) +
    `${pill(1.6)} fill="${CREAM}" stroke="${palette.face}" stroke-width="3.2"/>` +
    `${pill(4.6)} fill="none" stroke="${palette.face}" stroke-width="0.9"/>` +
    `<circle cx="${x + height * 0.36}" cy="${c}" r="1.6" fill="${palette.face}"/>` +
    `<circle cx="${x + width - height * 0.36}" cy="${c}" r="1.6" fill="${palette.face}"/>` +
    `</svg>`
  );
}

// A shaped badge: the tag's colour, a pattern in its own shade, and a deep
// outline in place of black.
function badgeSvg(
  family: TagFamily,
  palette: Palette,
  decoration: Decoration,
  box: number,
  r: number,
  cut: number,
  peelAt: number | null,
): string {
  const c = box / 2;
  const face = shapePath(family, c, c, r);
  return (
    svgOpen(box) +
    `<clipPath id="face"><path d="${face}"/></clipPath>` +
    cutAndShadow(`<path d="${face}"/>`, cut) +
    `<path d="${face}" fill="${palette.face}"/>` +
    `<g clip-path="url(#face)">${decorate(decoration, c, c, r, palette)}</g>` +
    `<path d="${face}" fill="none" stroke="${palette.ink}" stroke-width="2.2" stroke-linejoin="round"/>` +
    (peelAt != null ? peel(c, r + cut * 0.7, peelAt) : '') +
    `</svg>`
  );
}

function decorate(decoration: Decoration, cx: number, cy: number, r: number, palette: Palette): string {
  switch (decoration) {
    case 'rays': {
      let out = '';
      const count = 16;
      for (let i = 0; i < count; i++) {
        const a0 = (i / count) * Math.PI * 2;
        const a1 = a0 + Math.PI / count;
        out +=
          `<path d="M${cx} ${cy} L${(cx + Math.cos(a0) * r * 1.5).toFixed(1)} ${(cy + Math.sin(a0) * r * 1.5).toFixed(1)} ` +
          `L${(cx + Math.cos(a1) * r * 1.5).toFixed(1)} ${(cy + Math.sin(a1) * r * 1.5).toFixed(1)} Z" fill="${palette.shade}"/>`;
      }
      return out;
    }
    case 'sparkles': {
      // Four-pointed glints in cream, round where the picture sits.
      const star = (x: number, y: number, k: number) =>
        `<path d="M${x} ${y - k} Q${x} ${y} ${x + k} ${y} Q${x} ${y} ${x} ${y + k} Q${x} ${y} ${x - k} ${y} Q${x} ${y} ${x} ${y - k} Z" fill="${CREAM}"/>`;
      return (
        `<circle cx="${cx}" cy="${cy - r * 0.08}" r="${r * 0.62}" fill="${palette.shade}"/>` +
        star(cx - r * 0.62, cy - r * 0.5, r * 0.16) +
        star(cx + r * 0.66, cy - r * 0.28, r * 0.12) +
        star(cx + r * 0.42, cy - r * 0.7, r * 0.09)
      );
    }
    case 'stripes': {
      let out = '';
      for (let x = -r * 2; x < r * 2; x += r * 0.3) {
        out += `<line x1="${(cx + x).toFixed(1)}" y1="${(cy + r).toFixed(1)}" x2="${(cx + x + r).toFixed(1)}" y2="${(cy - r).toFixed(1)}" stroke="${palette.shade}" stroke-width="${(r * 0.13).toFixed(1)}"/>`;
      }
      return out;
    }
    case 'halftone': {
      let out = '';
      const step = r * 0.2;
      for (let y = cy - r; y <= cy + r; y += step) {
        for (let x = cx - r; x <= cx + r; x += step) {
          // Heavier towards the top left, gone by the middle.
          const t = 1 - (x - (cx - r) + (y - (cy - r))) / (r * 2.2);
          if (t <= 0) continue;
          out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(t * step * 0.42).toFixed(2)}" fill="${palette.shade}"/>`;
        }
      }
      return out;
    }
    case 'ring':
      return (
        `<circle cx="${cx}" cy="${cy}" r="${r * 0.8}" fill="none" stroke="${palette.shade}" stroke-width="${r * 0.12}"/>` +
        Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return `<circle cx="${(cx + Math.cos(a) * r * 0.8).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.8).toFixed(1)}" r="${(r * 0.05).toFixed(2)}" fill="${CREAM}"/>`;
        }).join('')
      );
    case 'plain':
      // A soft highlight across the upper left, and nothing else.
      return `<ellipse cx="${cx - r * 0.35}" cy="${cy - r * 0.55}" rx="${r * 0.85}" ry="${r * 0.4}" fill="#ffffff" fill-opacity="0.18" transform="rotate(-24 ${cx} ${cy})"/>`;
  }
}

// A corner of the sticker lifting off the card: the flap folded back, its
// pale underside showing.
function peel(c: number, radius: number, angle: number): string {
  const px = c + Math.cos(angle) * radius;
  const py = c + Math.sin(angle) * radius;
  const tx = -Math.sin(angle);
  const ty = Math.cos(angle);
  const span = 6;
  const ax = px + tx * span;
  const ay = py + ty * span;
  const bx = px - tx * span;
  const by = py - ty * span;
  const fx = px - Math.cos(angle) * 7.5;
  const fy = py - Math.sin(angle) * 7.5;
  return (
    `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)} Q${px.toFixed(1)} ${py.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)} Z" fill="${BrandColors.background}" fill-opacity="0.85"/>` +
    `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)} Q${fx.toFixed(1)} ${fy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)} Z" fill="#e9e2c9"/>` +
    `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)} Q${fx.toFixed(1)} ${fy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="0.8"/>`
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
  centred: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centredBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  offsetCopy: {
    position: 'absolute',
    transform: [{ translateX: 1.4 }, { translateY: 1.6 }],
  },
  // Each copy laid over the same spot, so they make one word with an edge.
  lettering: {
    position: 'absolute',
    fontFamily: BrandFonts.condensedHeavy,
    textAlign: 'center',
    includeFontPadding: false,
  },
  arcChar: {
    position: 'absolute',
    fontFamily: BrandFonts.condensedHeavy,
    textAlign: 'center',
    includeFontPadding: false,
  },
  labelText: {
    fontFamily: BrandFonts.serifDisplay,
    textAlign: 'center',
    includeFontPadding: false,
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
