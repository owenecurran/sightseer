import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableProps,
} from 'react-native';

import { BrandFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { svgDataUri } from '@/lib/base64';
import { randomFor } from '@/lib/seeded-random';

type ButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
};

// The two buttons the whole app is built from, made as things rather than
// as an app's rounded slabs: the primary one is a strip of cream card cut
// out with scissors and printed with a ticket's double rule, and the
// secondary one is a box drawn in pen round the words. Both are typed.
//
// The shapes are drawn to the button's measured size, so nothing is
// stretched, and each label gets its own cut or its own pen stroke, seeded
// so a button keeps the same one every time it is drawn.
export function Button({ label, variant = 'primary', loading, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const w = Math.round(event.nativeEvent.layout.width);
    const h = Math.round(event.nativeEvent.layout.height);
    if (!size || size.w !== w || size.h !== h) setSize({ w, h });
  };

  const art = useMemo(() => {
    if (!size || size.w < 8 || size.h < 8) return null;
    const random = randomFor(`button-${variant}-${label}`);
    return svgDataUri(
      isPrimary
        ? cardSvg(random, size.w, size.h, theme.text, theme.background)
        : penBoxSvg(random, size.w, size.h, theme.text),
    );
  }, [size, variant, label, isPrimary, theme.text, theme.background]);

  return (
    <Pressable disabled={disabled || loading} {...rest} style={style}>
      {({ pressed }) => (
        <View
          onLayout={onLayout}
          style={[
            styles.button,
            pressed && (isPrimary ? styles.pressedCard : styles.pressed),
            (disabled || loading) && styles.disabled,
          ]}>
          {/* The card's own colour, just inside where the scissors went, so
              the label never sits on bare page for the frame or two the
              cut-out takes to decode. The cut always lands outside it. */}
          {isPrimary && <View style={[styles.cardFill, { backgroundColor: theme.text }]} />}
          {art && <Image source={{ uri: art }} style={styles.art} contentFit="fill" />}
          {loading ? (
            <ActivityIndicator color={isPrimary ? theme.background : theme.text} />
          ) : (
            <Text style={[styles.label, { color: isPrimary ? theme.background : theme.text }]}>{label}</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

// How far past the button the artwork reaches, for the card's shadow and the
// pen's overshoot at the corners.
const BLEED = 6;
// How far inside the button the plain fill sits. The scissor cut only ever
// wanders outward from here, never in, so the fill never shows an edge.
const FILL_INSET = 2;

type Random = () => number;
type Point = [number, number];

const f = (n: number) => n.toFixed(1);

// One side of the card as scissors cut it: a few straight snips, each at a
// slightly different angle, never quite the line a ruler would give.
function snips(random: Random, from: Point, to: Point, outward: Point): Point[] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const count = Math.max(1, Math.round(length / (70 + random() * 50)));
  const points: Point[] = [];
  for (let i = 1; i < count; i++) {
    const t = (i + (random() - 0.5) * 0.5) / count;
    const off = random() * 1.5;
    points.push([
      from[0] + (to[0] - from[0]) * t + outward[0] * off,
      from[1] + (to[1] - from[1]) * t + outward[1] * off,
    ]);
  }
  points.push(to);
  return points;
}

function cardSvg(random: Random, w: number, h: number, paper: string, ink: string): string {
  const W = w + BLEED * 2;
  const H = h + BLEED * 2;
  // Each corner lands somewhere between the button's edge and just inside
  // it, and between the fill's edge and the button's: outside the fill
  // always, so no straight edge of it can show.
  const corner = (x: number, y: number, sx: number, sy: number): Point => [
    x + sx * (random() * (FILL_INSET + 0.4) - 0.8),
    y + sy * (random() * (FILL_INSET + 0.4) - 0.8),
  ];
  const tl = corner(BLEED, BLEED, 1, 1);
  const tr = corner(BLEED + w, BLEED, -1, 1);
  const br = corner(BLEED + w, BLEED + h, -1, -1);
  const bl = corner(BLEED, BLEED + h, 1, -1);
  const outline = [
    tl,
    ...snips(random, tl, tr, [0, -1]),
    ...snips(random, tr, br, [1, 0]),
    ...snips(random, br, bl, [0, 1]),
    ...snips(random, bl, tl, [-1, 0]),
  ];
  const d = `M${outline.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`;

  // The ticket's double rule, printed a touch off the card's centre the way
  // a two-colour job never quite registers.
  const shiftX = (random() - 0.5) * 1.4;
  const shiftY = (random() - 0.5) * 1.0;
  const rule = (inset: number, width: number, opacity: number) =>
    `<rect x="${f(BLEED + inset + shiftX)}" y="${f(BLEED + inset + shiftY)}" width="${f(w - inset * 2)}" height="${f(h - inset * 2)}" rx="1" fill="none" stroke="${ink}" stroke-opacity="${opacity}" stroke-width="${width}"/>`;
  const ruled = h >= 36 ? rule(5, 1.1, 0.32) + rule(7.5, 0.6, 0.22) : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    // Lifted a little off the page.
    `<path d="${d}" transform="translate(1.2 2.4)" fill="#000" fill-opacity="0.32"/>` +
    `<path d="${d}" fill="${paper}"/>` +
    ruled +
    `</svg>`
  );
}

// A box drawn round the words in one go: the pen starts along the top, goes
// all the way round, and runs on past where it started instead of closing
// neatly. Then a second, lighter pass over part of it, the way you go over a
// box again while thinking.
function penBoxSvg(random: Random, w: number, h: number, ink: string): string {
  const W = w + BLEED * 2;
  const H = h + BLEED * 2;
  const j = (amount: number) => (random() - 0.5) * 2 * amount;
  // A hand-drawn box is never square to the words: one side sits a little
  // higher than the other.
  const lean = j(1.6);
  const tl: Point = [BLEED + j(1.2), BLEED + lean + j(0.8)];
  const tr: Point = [BLEED + w + j(1.5), BLEED - lean + j(0.8)];
  const br: Point = [BLEED + w + j(1.5), BLEED + h - lean + j(1)];
  const bl: Point = [BLEED + j(1.2), BLEED + h + lean + j(1)];

  // Each side bows slightly, the way a wrist arcs.
  const side = (from: Point, to: Point, bow: number) => {
    const mx = (from[0] + to[0]) / 2;
    const my = (from[1] + to[1]) / 2;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    const b = j(bow);
    return `Q${f(mx - (dy / len) * b)} ${f(my + (dx / len) * b)} ${f(to[0])} ${f(to[1])}`;
  };

  const startX = BLEED + 8 + random() * Math.min(24, w * 0.2);
  const start: Point = [startX, tl[1] + (startX - tl[0]) * ((tr[1] - tl[1]) / (tr[0] - tl[0])) + j(0.6)];
  const overrun: Point = [start[0] + 10 + random() * 16, start[1] - 1.2 - random() * 1.5];

  const loop =
    `M${f(start[0])} ${f(start[1])} ` +
    side(start, tr, 1.4) +
    side(tr, br, 1.2) +
    side(br, bl, 1.8) +
    side(bl, tl, 1.2) +
    side(tl, overrun, 0.8);

  // The second pass: a stretch of the bottom and left, a little apart from
  // the first line.
  const nudge = (p: Point): Point => [p[0] + j(1.4), p[1] + j(1.4)];
  const a = nudge([br[0] - w * (0.2 + random() * 0.3), br[1]]);
  const b = nudge(bl);
  const c = nudge([tl[0], tl[1] + h * (0.2 + random() * 0.4)]);
  const retrace = `M${f(a[0])} ${f(a[1])} ` + side(a, b, 1.4) + side(b, c, 1);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<path d="${loop}" fill="none" stroke="${ink}" stroke-opacity="0.62" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${retrace}" fill="none" stroke="${ink}" stroke-opacity="0.28" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFill: {
    position: 'absolute',
    top: FILL_INSET,
    left: FILL_INSET,
    right: FILL_INSET,
    bottom: FILL_INSET,
  },
  art: {
    position: 'absolute',
    top: -BLEED,
    left: -BLEED,
    right: -BLEED,
    bottom: -BLEED,
  },
  // Typed, like everything else in the journal. Slightly larger than the
  // rounded sans it replaces: the typewriter face is lighter, and at 16 it
  // read as a caption rather than something to press.
  label: {
    fontFamily: BrandFonts.typewriter,
    fontSize: 17,
    includeFontPadding: false,
  },
  pressed: {
    opacity: 0.6,
  },
  // A card pressed into the page rather than faded out.
  pressedCard: {
    transform: [{ translateY: 1.5 }],
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.5,
  },
});
