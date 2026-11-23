import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { BrandFonts, StickerAccents } from '@/constants/theme';
import { svgDataUri } from '@/lib/base64';
import { hashSeed, randomFor } from '@/lib/seeded-random';
import { tagSlogan } from '@/lib/tag-icons';
import { hasStickerArt, stickerArtBounds, stickerArtSvg } from '@/components/ui/sticker-art';
import { StickerCallout, type CalloutSide } from '@/components/ui/sticker-callout';
import {
  fitArc,
  fitLabel,
  fitLettering,
  fitStampCentre,
  type LabelShape,
  type LetteringLayout,
} from '@/components/ui/sticker-text';

const DEFAULT_SIZE = 50;
// The white die-cut margin round the sticker, at its widest. Each copy is
// cut a little differently, never wider than this.
const DIE_CUT = 4;

// The square a sticker of this size takes up, die-cut and all. The card back
// lays its stickers out by it.
export function stickerBox(size: number = DEFAULT_SIZE): number {
  return Math.round(size * 1.3 + DIE_CUT * 2);
}
// How long the arrow and the name stay up before tidying themselves away.
const REVEAL_MS = 3500;
const CREAM = '#f6f1df';
// A stamp's inner ring, as a share of the stamp's radius.
const STAMP_INNER = 0.46;
// How far a sticker leans either way, in degrees. Seeded per sticker and per
// review, so the same sticker leans the same way on the front of a card as
// on its back.
const STICKER_TILT = 5;
// Clear card kept between cut lettering and the edge of its box, in points.
const LETTERING_MARGIN = 1;

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

// What each tag's sticker is. A tag whose meaning is a THING gets a drawing of
// it and no words (see sticker-art.ts): a dog for pet friendly, a cup for
// coffee. A tag whose meaning is an idea gets words, chosen per tag rather
// than drawn from a hash: die-cut lettering for a single loud word, a rubber
// stamp for a verdict, an oval label for something quieter.
type TextSticker =
  | { kind: 'lettering'; word: string }
  | { kind: 'label'; word: string }
  // The rim's words, and what is in the middle: a short word, or "*" for a
  // star.
  | { kind: 'stamp'; rim: string; centre: string };

const TEXT_STICKERS: Record<string, TextSticker> = {
  'scenic-location': { kind: 'label', word: 'What a view' },
  vibe: { kind: 'lettering', word: 'Vibes' },
  cozy: { kind: 'label', word: 'Cozy' },
  quiet: { kind: 'label', word: 'Shh' },
  lively: { kind: 'lettering', word: 'Buzzing' },
  'young-people': { kind: 'lettering', word: 'Young' },
  'solo-friendly': { kind: 'label', word: 'Solo' },
  'good-for-groups': { kind: 'lettering', word: 'Crew' },
  'date-spot': { kind: 'label', word: 'Date night' },
  'local-food': { kind: 'label', word: 'Local eats' },
  affordable: { kind: 'stamp', rim: 'GOOD VALUE', centre: '$' },
  free: { kind: 'lettering', word: 'Free' },
  'gets-crowded': { kind: 'lettering', word: 'Busy' },
  'book-ahead': { kind: 'stamp', rim: 'BOOK AHEAD', centre: '*' },
  'local-secret': { kind: 'label', word: 'Hidden gem' },
  'highlight-of-the-city': { kind: 'stamp', rim: 'MUST SEE', centre: '*' },
  'worth-the-detour': { kind: 'stamp', rim: 'WORTH IT', centre: '*' },
  underrated: { kind: 'stamp', rim: 'UNDERRATED', centre: '*' },
  overrated: { kind: 'lettering', word: 'Meh' },
};

type StickerDesign = { kind: 'picture' } | TextSticker;

function designFor(slug: string, label: string): StickerDesign {
  if (hasStickerArt(slug)) return { kind: 'picture' };
  // A tag added after this list was written: its slogan, lettered.
  return TEXT_STICKERS[slug] ?? { kind: 'lettering', word: tagSlogan(slug, label) };
}

// Cut lettering's lines and size: as large as fits inside the box once the
// die-cut edge round the letters is allowed for, and never above a third of
// the box, so a short word like MEH does not swell to fill it. See
// fitLettering, which works from the face's real letter widths.
function letteringLayout(word: string, box: number): LetteringLayout & { lines: string[] } {
  const lines = splitWord(word.toUpperCase()).split('\n');
  return { lines, ...fitLettering(lines, box - (DIE_CUT + LETTERING_MARGIN) * 2, box * 0.34) };
}

// A label's printed parts, in points: drawn by labelSvg, and the clear inside
// its words are fitted to. The border, keyline and dots are their full
// widths on a 50-point sticker and scale with it, so a small copy keeps its
// proportions instead of filling up with border.
function labelGeometry(box: number, r: number, cut: number, lines: 1 | 2) {
  const k = r / 25;
  const width = box - cut * 2 - 6;
  const height = labelHeight(r, lines);
  const border = 3.2 * k;
  const keylineInset = 4.6 * k;
  const keyline = 0.9 * k;
  const clearInset = keylineInset + keyline / 2;
  const dotRadius = 1.6 * k;
  // One line: the dots sit in line with the words, a little in from each
  // end. Two lines: right out in the round ends, where neither line reaches.
  // In line with the words they sat in the gap between the two lines and
  // crowded the ends of both.
  const dotX = lines === 2 ? width / 2 - clearInset - dotRadius - 1.5 * k : width / 2 - height * 0.36;
  const shape: LabelShape = {
    width: width - clearInset * 2,
    height: height - clearInset * 2,
    dotX,
    dotRadius,
    margin: k,
  };
  return { width, height, border, keylineInset, keyline, dotX, dotRadius, shape };
}

// A stamp's rings, in points: drawn by stampSvg, and the clear band between
// them the rim's words are fitted to. Scaled with the stamp, like a label's
// border.
function stampGeometry(r: number) {
  const k = r / 25;
  const rimWidth = 2.6 * k;
  const rimRadius = r - 2.4 * k;
  const ringRadius = r * STAMP_INNER;
  const ringWidth = k;
  const margin = 0.8 * k;
  return {
    rimWidth,
    rimRadius,
    ringRadius,
    ringWidth,
    // The clear band the rim's words run round.
    inner: ringRadius + ringWidth / 2 + margin,
    outer: rimRadius - rimWidth / 2 - margin,
    // The clear circle inside the ring, for a word or sign in the middle.
    centre: ringRadius - ringWidth / 2 - margin,
  };
}

// How one copy of a sticker is stuck on: its lean, how wide its die-cut
// margin came out, and the lean of its name's label when tapped. Seeded per
// sticker and per review (`placementSeed`), so the same sticker is cut and
// leans the same way on the front of a card as on its back, and so the card
// can space its stickers by how each one actually came out.
export function stickerLook(slug: string, placementSeed?: string) {
  const random = randomFor(`tag-graphic:${slug}:${placementSeed ?? ''}`);
  // In this order: each is the next draw from the same sequence.
  const tilt = (random() * 2 - 1) * STICKER_TILT;
  const cut = 2.8 + random() * (DIE_CUT - 2.8);
  const calloutTilt = (random() * 2 - 1) * 3;
  return { tilt, cut, calloutTilt };
}

// A sticker's visible shape, upright: the printed shape and its die-cut
// edge, in points. `dx` and `dy` are how far its middle sits from the box's
// middle; `round` says whether its edge is a curve (a drawing, a stamp)
// rather than a box (lettering, a label); `tilt` is how far the copy leans,
// in degrees, about the box's middle. What the arrow on its name points at.
export type StickerBody = { width: number; height: number; dx: number; dy: number; round: boolean; tilt: number };

export function stickerBody(slug: string, label: string, size: number = DEFAULT_SIZE, placementSeed?: string): StickerBody {
  const box = stickerBox(size);
  const r = size / 2;
  const { tilt, cut } = stickerLook(slug, placementSeed);
  const design = designFor(slug, label);
  switch (design.kind) {
    case 'picture': {
      // designFor only says picture when there is a drawing, so this is
      // never null in practice.
      const art = stickerArtBounds(slug, box, cut) ?? { x: 0, y: 0, width: box, height: box };
      return {
        width: art.width,
        height: art.height,
        dx: art.x + art.width / 2 - box / 2,
        dy: art.y + art.height / 2 - box / 2,
        round: true,
        tilt,
      };
    }
    case 'stamp':
      return { width: size + cut * 2, height: size + cut * 2, dx: 0, dy: 0, round: true, tilt };
    case 'label':
      // The pill is drawn narrower by the cut on each side, so with its cut
      // it is always this wide.
      return { width: box - 6, height: labelHeight(r, labelLines(design.word)) + cut * 2, dx: 0, dy: 0, round: false, tilt };
    case 'lettering': {
      // Exactly as Lettering sets it: the letters' ink, and the die-cut edge
      // round it.
      const { width, height } = letteringLayout(design.word, box);
      return { width: width + cut * 2, height: height + cut * 2, dx: 0, dy: 0, round: false, tilt };
    }
  }
}

// The part of a sticker's box that is actually sticker, as it is stuck on:
// leaning, and with the die-cut this copy has. `dx` and `dy` are how far its
// middle sits from the box's middle. The card spaces its stickers by this, so
// the bare card between neighbours is the same whatever shape each one is
// and whichever way it leans.
//
// It used to be the upright shape at the widest cut, with a fixed allowance
// for the lean. A lean of 5 degrees lifts the corners of a wide sticker by
// nearly 3 points, more than the allowance, so two leaning neighbours came
// within 2 points of each other where 6 were meant; and a narrow cut left
// 8. Measured over 3,000 cards.
export function stickerFootprint(
  slug: string,
  label: string,
  size: number = DEFAULT_SIZE,
  placementSeed?: string,
): { width: number; height: number; dx: number; dy: number } {
  const body = stickerBody(slug, label, size, placementSeed);
  const design = designFor(slug, label);
  const a = (body.tilt * Math.PI) / 180;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  switch (design.kind) {
    case 'picture': {
      // The drawing itself, turned: its own outline, not its box's corners.
      const box = stickerBox(size);
      const art =
        stickerArtBounds(slug, box, stickerLook(slug, placementSeed).cut, body.tilt) ??
        { x: 0, y: 0, width: box, height: box };
      return {
        width: art.width,
        height: art.height,
        dx: art.x + art.width / 2 - box / 2,
        dy: art.y + art.height / 2 - box / 2,
      };
    }
    case 'stamp':
      // Round, so leaning changes nothing.
      return { width: body.width, height: body.height, dx: 0, dy: 0 };
    case 'label': {
      // A pill: a straight middle with a half circle on each end.
      const radius = body.height / 2;
      const straight = body.width / 2 - radius;
      return { width: (straight * cos + radius) * 2, height: (straight * sin + radius) * 2, dx: 0, dy: 0 };
    }
    case 'lettering':
      // A block of letters, corners and all.
      return {
        width: body.width * cos + body.height * sin,
        height: body.width * sin + body.height * cos,
        dx: 0,
        dy: 0,
      };
  }
}

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
  // Which side of the sticker its name goes on when tapped. The card back
  // picks one with room for each sticker (see chooseCalloutSide); elsewhere
  // it is up and to the right.
  calloutSide?: CalloutSide;
  // Whether its name is showing, when something around it decides: the card
  // back shows one sticker's name at a time, because two labels opened side
  // by side landed on top of each other. Tapping reports the sticker's own
  // slug to open it and null to close it. Left out, the sticker keeps track
  // of this itself.
  revealed?: boolean;
  onRevealChange?: (slug: string | null) => void;
  // Where the card puts it, when the card lays its stickers out itself.
  style?: StyleProp<ViewStyle>;
};

// A descriptive tag on the back of a postcard, as a sticker off a sheet:
// either a drawing of the thing itself, or the words, lettered, stamped or
// on a label (see designFor).
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
  calloutSide = 'above-right',
  revealed,
  onRevealChange,
  style,
}: TagStickerGraphicProps) {
  const [ownRevealed, setOwnRevealed] = useState(false);
  const controlled = revealed !== undefined;
  const isRevealed = controlled ? revealed : ownRevealed;
  const setRevealed = useCallback(
    (next: boolean) => {
      if (controlled) onRevealChange?.(next ? slug : null);
      else setOwnRevealed(next);
    },
    [controlled, onRevealChange, slug],
  );
  const look = useMemo(() => {
    const hash = hashSeed(slug);
    const accent = StickerAccents[hash % StickerAccents.length];
    return {
      ...stickerLook(slug, placementSeed),
      design: designFor(slug, label),
      palette: PALETTES[accent] ?? PALETTES['#a0bd91'],
      wearSeed: `${slug}:${placementSeed ?? ''}`,
    };
  }, [slug, label, placementSeed]);
  // What the arrow on its name points at. Only needed once it is tapped.
  const body = useMemo(
    () => (isRevealed ? stickerBody(slug, label, size, placementSeed) : null),
    [isRevealed, slug, label, size, placementSeed],
  );

  useEffect(() => {
    if (!isRevealed) return;
    const timer = setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [isRevealed, setRevealed]);

  function handlePress() {
    if (!isRevealed) {
      setRevealed(true);
      return;
    }
    setRevealed(false);
    router.push({ pathname: '/tag/[slug]', params: { slug } });
  }

  const box = stickerBox(size);
  const sticker = <StickerFace look={look} slug={slug} size={size} box={box} />;
  const lean = look.tilt;

  if (!interactive) {
    return (
      <View style={[styles.chosen, style]}>
        <View style={{ width: box, height: box, transform: [{ rotate: `${lean}deg` }] }}>{sticker}</View>
        {showLabel && (
          <Text style={styles.caption} numberOfLines={2}>
            {label}
          </Text>
        )}
      </View>
    );
  }

  return (
    // Raised while its name is showing, so stickers stuck on after it do not
    // paint over the name.
    <View style={[{ width: box, height: box }, style, isRevealed && styles.raised]}>
      <Pressable
        onPress={handlePress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={isRevealed ? `${label}. Tap again for more reviews tagged ${label}` : label}
        style={{ width: box, height: box, transform: [{ rotate: `${lean}deg` }] }}>
        {sticker}
      </Pressable>

      {isRevealed && body && (
        // The name on a label stuck beside the sticker, with an arrow to it,
        // on whichever side it was given. See StickerCallout.
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(140)}
          pointerEvents="none"
          style={styles.callout}>
          <StickerCallout
            side={calloutSide}
            box={box}
            target={body}
            label={label}
            border={look.palette.face}
            ink={look.palette.ink}
            tilt={look.calloutTilt}
          />
        </Animated.View>
      )}
    </View>
  );
}

type Look = {
  design: StickerDesign;
  palette: Palette;
  cut: number;
  wearSeed: string;
};

function StickerFace({ look, slug, size, box }: { look: Look; slug: string; size: number; box: number }) {
  const { design, palette, cut, wearSeed } = look;
  const c = box / 2;
  const r = size / 2;
  const drawn = useMemo(() => {
    switch (design.kind) {
      case 'picture': {
        const art = stickerArtSvg(slug, box, cut, hashSeed(wearSeed));
        return { base: art ? svgDataUri(art) : null, wear: null };
      }
      case 'stamp':
        return {
          base: svgDataUri(stampSvg(palette, box, r, cut, design.centre === '*')),
          wear: svgDataUri(stampWearSvg(box, r, wearSeed)),
        };
      case 'label':
        return { base: svgDataUri(labelSvg(palette, box, r, cut, labelLines(design.word))), wear: null };
      case 'lettering':
        return { base: null, wear: null };
    }
  }, [design, slug, palette, box, r, cut, wearSeed]);

  // Every word is set at a size worked out to fit its shape (see
  // sticker-text.ts), and none of it follows the phone's text-size setting:
  // at a larger setting the same words would simply run off the sticker.
  let printed: ReactNode = null;
  switch (design.kind) {
    case 'lettering':
      printed = <Lettering word={design.word} palette={palette} box={box} cut={cut} />;
      break;
    case 'stamp': {
      const centre = design.centre;
      const stamp = stampGeometry(r);
      const fit = centre !== '*' ? fitStampCentre(centre, stamp.centre) : null;
      printed = (
        <>
          <ArcText text={design.rim} c={c} inner={stamp.inner} outer={stamp.outer} color={palette.shade} />
          {fit && (
            <View style={[styles.centred, styles.fill]}>
              <Text
                allowFontScaling={false}
                style={[
                  styles.stampCentre,
                  {
                    color: palette.shade,
                    fontSize: fit.fontSize,
                    lineHeight: fit.lineHeight,
                    transform: [{ translateY: fit.shiftY }],
                  },
                ]}>
                {centre}
              </Text>
            </View>
          )}
        </>
      );
      break;
    }
    case 'label': {
      const lines = labelLines(design.word);
      const words = (lines === 2 ? splitWord(design.word) : design.word).split('\n');
      const fit = fitLabel(words, labelGeometry(box, r, cut, lines).shape);
      printed = (
        <View style={[styles.centred, styles.fill]}>
          <Text
            allowFontScaling={false}
            numberOfLines={lines}
            style={[
              styles.labelText,
              {
                color: palette.ink,
                fontSize: fit.fontSize,
                lineHeight: fit.lineHeight,
                paddingVertical: fit.padding,
                // The sticker's full width rather than whatever the text
                // measures. The lines are already broken and fitted, so it
                // never needs to wrap; left to its own measured width, it did,
                // with the phone's text size turned up: "What a" broke after
                // "What" and the label came out as "What / a...".
                width: box,
                transform: [{ translateY: fit.shiftY }],
              },
            ]}>
            {words.join('\n')}
          </Text>
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

// A label's words go onto two lines when there are two of them and they
// would be set too small on one.
function labelLines(word: string): 1 | 2 {
  return word.includes(' ') && word.length > 6 ? 2 : 1;
}

function labelHeight(r: number, lines: 1 | 2): number {
  return lines === 2 ? r * 1.5 : r * 1.1;
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
  // Sized so the letters and their die-cut edge stay inside the box (see
  // letteringLayout); this copy's cut is never wider than the one allowed for.
  const { lines, fontSize, lineHeight } = letteringLayout(word, box);
  const text = lines.join('\n');
  const layer = (color: string, dx: number, dy: number, key: string) => (
    <Text
      key={key}
      allowFontScaling={false}
      numberOfLines={lines.length}
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
// rubber stamp sets its words round the rim: inside the clear band between
// radii `inner` and `outer`, sized and spaced by fitArc.
function ArcText({ text, c, inner, outer, color }: { text: string; c: number; inner: number; outer: number; color: string }) {
  const { fontSize, lineHeight, radius, glyphs } = useMemo(() => fitArc(text, inner, outer), [text, inner, outer]);
  // Twice the size, wider than any letter in the face (W is 1.26 em), so no
  // letter is ever cut off by its own box. Each is centred in it either way.
  const width = fontSize * 2;
  const height = lineHeight;
  return (
    <>
      {glyphs.map(({ char, angle }, i) => {
        return (
          <Text
            key={i}
            allowFontScaling={false}
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
function stampSvg(palette: Palette, box: number, r: number, cut: number, centreStar: boolean): string {
  const c = box / 2;
  const stamp = stampGeometry(r);
  // Down the middle of the band the words run round.
  const dotRing = (stamp.inner + stamp.outer) / 2;
  const dots = [-0.32, 0, 0.32]
    .map((a) => {
      const angle = Math.PI / 2 + a;
      return `<circle cx="${(c + Math.cos(angle) * dotRing).toFixed(1)}" cy="${(c + Math.sin(angle) * dotRing).toFixed(1)}" r="${(r * 0.06).toFixed(2)}" fill="${palette.shade}"/>`;
    })
    .join('');
  return (
    svgOpen(box) +
    cutAndShadow(`<circle cx="${c}" cy="${c}" r="${r}"/>`, cut) +
    `<circle cx="${c}" cy="${c}" r="${stamp.rimRadius.toFixed(2)}" fill="none" stroke="${palette.shade}" stroke-width="${stamp.rimWidth.toFixed(2)}"/>` +
    `<circle cx="${c}" cy="${c}" r="${stamp.ringRadius.toFixed(2)}" fill="none" stroke="${palette.shade}" stroke-width="${stamp.ringWidth.toFixed(2)}"/>` +
    dots +
    (centreStar ? `<path d="${starPath(c, c, r * 0.3)}" fill="${palette.shade}"/>` : '') +
    `</svg>`
  );
}

function starPath(cx: number, cy: number, r: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
  }
  return `${d}Z`;
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
function labelSvg(palette: Palette, box: number, r: number, cut: number, lines: 1 | 2): string {
  const c = box / 2;
  const { width, height, border, keylineInset, keyline, dotX, dotRadius } = labelGeometry(box, r, cut, lines);
  const x = c - width / 2;
  const y = c - height / 2;
  const pill = (inset: number) =>
    `<rect x="${x + inset}" y="${y + inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${(height - inset * 2) / 2}"`;
  return (
    svgOpen(box) +
    cutAndShadow(`${pill(0)}/>`, cut) +
    `${pill(border / 2)} fill="${CREAM}" stroke="${palette.face}" stroke-width="${border.toFixed(2)}"/>` +
    `${pill(keylineInset)} fill="none" stroke="${palette.face}" stroke-width="${keyline.toFixed(2)}"/>` +
    `<circle cx="${(c - dotX).toFixed(2)}" cy="${c}" r="${dotRadius.toFixed(2)}" fill="${palette.face}"/>` +
    `<circle cx="${(c + dotX).toFixed(2)}" cy="${c}" r="${dotRadius.toFixed(2)}" fill="${palette.face}"/>` +
    `</svg>`
  );
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
  // With centred: the sticker's whole box, so whatever is in it is centred on
  // the sticker's middle.
  fill: {
    top: 0,
    bottom: 0,
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
  stampCentre: {
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
  // Typed under the sticker, in the tag's own case, like the labels on Add
  // a review. These were the heavy spaced capitals, which shouted the name
  // of something the sticker above it already showed. No letterSpacing:
  // with any, Android measured the caption a character short and clipped
  // its last letter ("WATERFRON").
  caption: {
    fontFamily: BrandFonts.typewriter,
    fontSize: 12,
    lineHeight: 15,
    color: 'rgba(234, 231, 207, 0.8)',
    textAlign: 'center',
    maxWidth: 110,
  },
  // The sticker's own box; the label and arrow are placed around it from
  // inside, and spill out of it.
  callout: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
  },
  raised: {
    zIndex: 1,
  },
});
