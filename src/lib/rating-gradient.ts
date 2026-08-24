// Value-space stops (0-10) and their colors — the one source of truth for
// the review-rating gradient, used both by the interactive slider
// (rating-slider.tsx, sampled per-pixel inside its SkSL shader) and by
// static rating displays elsewhere (rating-glass-badge.tsx, via
// colorForRating below) that need a single flat color for a given value
// rather than a live gradient. Irregular spacing and a couple of
// deliberately "off" hues (burnt orange, chartreuse) rather than a clean
// spectral sweep — a plain 5-stop red-yellow-green-teal ramp read as a
// generated rainbow, not a designed one.
export const RATING_GRADIENT_STOPS = [0, 0.08, 0.22, 0.4, 0.55, 0.7, 0.85, 1];
export const RATING_GRADIENT_COLORS = [
  '#3a0142',
  '#8c0d2f',
  '#d4491f',
  '#e8a71c',
  '#c9d41c',
  '#4a9c3f',
  '#0f8a72',
  '#05e8b7',
];

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (c: number) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Plain-JS piecewise-linear color interpolation, mirroring the SkSL
// track() function in liquid-glass-track.tsx exactly (same stops/colors,
// same clamp-then-lerp shape) — that one only runs per-pixel on the GPU
// inside the slider's own Canvas, so anything wanting "the gradient color
// at rating X" as a single static value (not a live per-pixel effect)
// needs this instead.
export function colorForRating(rating: number, max = 10): string {
  const t = clamp(rating / max, 0, 1);

  for (let i = 0; i < RATING_GRADIENT_STOPS.length - 1; i++) {
    const a = RATING_GRADIENT_STOPS[i];
    const b = RATING_GRADIENT_STOPS[i + 1];
    if (t >= a && t <= b) {
      const localT = b - a > 0 ? (t - a) / (b - a) : 0;
      const [r1, g1, b1] = hexToRgb(RATING_GRADIENT_COLORS[i]);
      const [r2, g2, b2] = hexToRgb(RATING_GRADIENT_COLORS[i + 1]);
      return rgbToHex([r1 + (r2 - r1) * localT, g1 + (g2 - g1) * localT, b1 + (b2 - b1) * localT]);
    }
  }
  return RATING_GRADIENT_COLORS[RATING_GRADIENT_COLORS.length - 1];
}

// Relative luminance (sRGB coefficients), 0–1. Only used to decide whether a
// gradient colour is dark enough to disappear against the app's background.
function luminanceOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// How bright a rating colour has to be before it reads on #031009. Tuned to
// the gradient's own dark end: at this floor the 0–2 range still reads as
// deep wine/plum rather than turning pink, but stops vanishing entirely.
const MIN_READABLE_LUMINANCE = 0.34;

// The gradient colour for a rating, lifted until it's actually visible on
// the app's near-black background.
//
// colorForRating alone is right wherever the colour sits on a light or
// mid-tone surface, but its bottom two stops (#3a0142 plum, #8c0d2f wine)
// have less contrast against #031009 than they do against black — so a
// poorly-rated trip's map ring, or a low-rated pin, effectively rendered as
// "no ring at all". Blending toward white rather than picking different
// colours keeps the hue (and therefore the meaning: red is still bad, teal
// is still good) while guaranteeing it can be seen.
export function readableColorForRating(rating: number, max = 10): string {
  const base = colorForRating(rating, max);
  const lum = luminanceOf(base);
  if (lum >= MIN_READABLE_LUMINANCE) return base;

  // Mixing with white moves luminance from `lum` to `lum + t(1 - lum)`;
  // this is that solved for the t which lands exactly on the floor.
  const t = (MIN_READABLE_LUMINANCE - lum) / (1 - lum);
  const [r, g, b] = hexToRgb(base);
  return rgbToHex([r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]);
}
