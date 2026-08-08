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
