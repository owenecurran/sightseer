import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';

// The colour a review's lettering is set in, taken from the picture it sits on
// — and then turned to the opposite side of the colour wheel.
//
// The seven lettering variants each carry a fixed colour, which is fine in
// isolation and arbitrary against any particular photograph — a gold name on a
// blue-grey lake has nothing to do with the lake. Reading the picture's own
// dominant colour and setting the name in it ties the two together, and gives
// the feed far more variety than seven fixed choices ever could.

// The picture is drawn into a tiny offscreen surface and read back from there,
// rather than reading the full-size bitmap. At this size the whole thing is a
// few hundred bytes and the averaging is free; any larger buys no accuracy,
// since what is wanted is the broad colour of the image, not its detail.
const SAMPLE = 24;

// Hue buckets. Coarse enough that a sky spread across a few degrees counts as
// one colour rather than several.
const BUCKETS = 18;

// A colour this unsaturated is a grey, and every photograph has plenty. They
// are dropped from the vote entirely — otherwise a picture that is mostly
// pavement returns pavement, which is not a colour anybody chose.
const MIN_SATURATION = 0.18;
// Nearly-black and blown-out pixels carry no reliable hue.
const MIN_VALUE = 0.12;
const MAX_VALUE = 0.97;

// Where the result is finally set, regardless of what the picture's own colour
// was doing. The name has to hold up as light type on an arbitrary photograph,
// so only the HUE is taken from the image — the saturation and lightness are
// fixed here, at the chalky end that the hand-picked variants already use.
// Taken literally, a dominant colour is very often a dark navy or a deep
// green, and setting a name in it against the photograph it came from is
// invisible.
const OUTPUT_SATURATION = 0.42;
const OUTPUT_LIGHTNESS = 0.78;

// Stands in for both halves of the pair on a picture with no usable hue.
const NEUTRAL = 'hsl(0, 0%, 82%)';

function rgbToHsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  hue = (hue * 60 + 360) % 360;

  return { hue, saturation: max === 0 ? 0 : delta / max, value: max };
}

// Where each hue on the screen's wheel sits on the painter's one.
//
// The two wheels do not agree about what is opposite what. On the RGB wheel
// yellow's opposite is blue; on the red-yellow-blue wheel every painter and
// every printed colour wheel uses, yellow's opposite is violet. Turning a hue
// half a circle in RGB gave the first answer, and a warm yellow photograph was
// coming back lettered in blue rather than the light purple it should be.
//
// Control points mapping RGB hue to RYB hue, interpolated between. Red,
// green and blue stay put; the difference is all in how much of the wheel
// yellow occupies, which on the painter's wheel is a third of it.
const RGB_TO_RYB: [number, number][] = [
  [0, 0],
  [60, 120],
  [120, 180],
  [180, 210],
  [240, 240],
  [300, 300],
  [360, 360],
];

function interpolate(value: number, table: [number, number][], reverse: boolean): number {
  const from = reverse ? 1 : 0;
  const to = reverse ? 0 : 1;
  for (let i = 0; i < table.length - 1; i++) {
    const lo = table[i];
    const hi = table[i + 1];
    if (value >= lo[from] && value <= hi[from]) {
      const span = hi[from] - lo[from];
      const ratio = span === 0 ? 0 : (value - lo[from]) / span;
      return lo[to] + (hi[to] - lo[to]) * ratio;
    }
  }
  return value;
}

// Half a turn on the painter's wheel, which is the turn people actually mean
// when they say "complementary".
function complementaryHue(hue: number): number {
  const ryb = interpolate(hue, RGB_TO_RYB, false);
  return interpolate((ryb + 180) % 360, RGB_TO_RYB, true);
}

function hslToCss(hue: number, saturation: number, lightness: number): string {
  return `hsl(${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(
    lightness * 100,
  )}%)`;
}

// Both halves of the pair the lettering uses: the picture's own dominant hue,
// and the colour opposite it.
export type ImageAccent = {
  dominant: string;
  complement: string;
  // Whether the picture is bright overall. Light letters on a light
  // photograph need something dark behind them or they vanish, and that is a
  // question about the WHOLE image — greys and all — rather than about the
  // hue vote below, which throws the greys away.
  isLight: boolean;
};

// Mean relative luminance above which a picture counts as light. Judged
// against the sampled average, so a bright sky over a dark foreground lands
// in the middle rather than counting as either.
const LIGHT_THRESHOLD = 0.58;

// Null when the picture has no colour worth taking — a black-and-white shot, a
// snowfield, a photograph of a road. The caller keeps the face's own colour in
// that case rather than being handed a grey.
export function accentFromImage(image: SkImage): ImageAccent | null {
  const surface = Skia.Surface.MakeOffscreen(SAMPLE, SAMPLE);
  if (!surface) return null;

  surface
    .getCanvas()
    .drawImageRect(
      image,
      { x: 0, y: 0, width: image.width(), height: image.height() },
      { x: 0, y: 0, width: SAMPLE, height: SAMPLE },
      Skia.Paint(),
    );

  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: SAMPLE,
    height: SAMPLE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels) return null;

  // Weighted by saturation, so a small patch of real colour outvotes a large
  // wash of nearly-grey. Summed as vectors on the hue circle rather than
  // averaged as numbers — hue wraps, and a mean of 350 and 10 is 180, which is
  // the opposite colour.
  const weights = new Array<number>(BUCKETS).fill(0);
  const sin = new Array<number>(BUCKETS).fill(0);
  const cos = new Array<number>(BUCKETS).fill(0);
  let luminance = 0;
  let counted = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = Number(pixels[i]) / 255;
    const g = Number(pixels[i + 1]) / 255;
    const b = Number(pixels[i + 2]) / 255;
    // Every pixel votes on brightness, including the greys the hue vote
    // discards — a photograph of snow has almost no hue and is as light as a
    // picture gets.
    luminance += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    counted += 1;

    const { hue, saturation, value } = rgbToHsv(r, g, b);
    if (saturation < MIN_SATURATION || value < MIN_VALUE || value > MAX_VALUE) continue;

    const bucket = Math.min(BUCKETS - 1, Math.floor((hue / 360) * BUCKETS));
    const weight = saturation * value;
    weights[bucket] += weight;
    const radians = (hue * Math.PI) / 180;
    sin[bucket] += Math.sin(radians) * weight;
    cos[bucket] += Math.cos(radians) * weight;
  }

  const isLight = counted > 0 && luminance / counted > LIGHT_THRESHOLD;

  let best = -1;
  let bestWeight = 0;
  for (let i = 0; i < BUCKETS; i++) {
    if (weights[i] > bestWeight) {
      bestWeight = weights[i];
      best = i;
    }
  }
  // No hue worth taking, but the brightness reading still stands — a
  // black-and-white photograph has no colour and is very much either light or
  // dark. The dominant and complement fall back to neutrals so the caller can
  // still use them.
  if (best < 0) {
    return { dominant: NEUTRAL, complement: NEUTRAL, isLight };
  }

  const hue = ((Math.atan2(sin[best], cos[best]) * 180) / Math.PI + 360) % 360;
  return {
    isLight,
    dominant: hslToCss(hue, OUTPUT_SATURATION, OUTPUT_LIGHTNESS),
    // Lettering set in the colour the photograph is already full of
    // disappears into it — a blue name on a lake reads as part of the lake.
    // The opposite hue is the one guaranteed to have nothing behind it
    // competing.
    complement: hslToCss(complementaryHue(hue), OUTPUT_SATURATION, OUTPUT_LIGHTNESS),
  };
}
