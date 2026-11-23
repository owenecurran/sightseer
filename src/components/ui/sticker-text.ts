// Text on the word stickers, fitted to the shape it is printed on.
//
// Each kind of word sticker (cut lettering, an oval label, a rubber stamp's
// rim) used to size its words from a rough guess at a letter's width: 0.74 em
// a capital for the lettering, half an em a letter for the labels. The real
// letters are nothing like uniform (MoonGet Heavy's I is 0.31 em and its W
// 1.26), so words came out too big for their stickers: "YOUNG" ran 11pt past
// its box, a one-line label set "Cozy" taller than the pill it was printed
// on, and the W of "What a view" crossed the label's curved end.
//
// Everything here works from the fonts' own measurements instead: each
// glyph's advance and ink box, and the ascent and descent Android lays a line
// out with. React Native 0.86 lays a line with a set lineHeight out the way
// the web does, centred on the font's ascent plus descent (see
// CustomLineHeightSpan), so where every glyph's ink lands is known exactly:
// no measuring pass, and no first frame at the wrong size.

// A glyph's advance and its ink box, in ems: x across from the pen, y up
// from the baseline.
export type Glyph = [advance: number, xMin: number, xMax: number, yMin: number, yMax: number];

export type FontMetrics = {
  // What Android lays a line out with, in ems.
  ascent: number;
  descent: number;
  glyphs: Record<string, Glyph>;
};

// The tables below are generated: each glyph's advance from the font's hmtx
// table and its ink box from its outline (fontTools' BoundsPen), divided by
// the font's units per em. Regenerate them if either font file changes.
// The lettering and stamp face (BrandFonts.condensedHeavy): MOON_GET-HEAVY.otf. Vertical metrics from OS/2 typo (USE_TYPO_METRICS is set).
export const MOONGET_HEAVY: FontMetrics = {
  ascent: 0.8,
  descent: 0.2,
  glyphs: {
    'A': [1.023, 0, 0.993, -0.2, 0.8], 'B': [0.818, 0, 0.788, -0.2, 0.8],
    'C': [0.968, 0, 0.938, -0.229, 0.815], 'D': [0.866, 0, 0.836, -0.2, 0.8],
    'E': [0.656, 0, 0.627, -0.2, 0.8], 'F': [0.672, 0, 0.642, -0.2, 0.8],
    'G': [1.089, 0, 1.059, -0.229, 0.815], 'H': [0.94, 0, 0.91, -0.2, 0.8],
    'I': [0.31, 0, 0.281, -0.2, 0.8], 'J': [0.58, 0, 0.55, -0.229, 0.8],
    'K': [0.895, 0, 0.866, -0.2, 0.8], 'L': [0.626, 0, 0.597, -0.2, 0.8],
    'M': [1.03, 0, 1, -0.2, 0.8], 'N': [0.91, 0, 0.881, -0.2, 0.8],
    'O': [1.089, 0, 1.059, -0.229, 0.815], 'P': [0.82, 0, 0.791, -0.2, 0.8],
    'Q': [1.089, 0, 1.059, -0.229, 0.815], 'R': [0.826, 0, 0.796, -0.215, 0.8],
    'S': [0.69, 0, 0.66, -0.229, 0.8], 'T': [0.788, 0, 0.759, -0.2, 0.8],
    'U': [0.895, 0, 0.865, -0.229, 0.8], 'V': [1.022, 0, 0.993, -0.2, 0.8],
    'W': [1.263, 0, 1.234, -0.2, 0.8], 'X': [0.937, 0, 0.907, -0.2, 0.8],
    'Y': [0.937, 0, 0.907, -0.2, 0.8], 'Z': [0.79, 0, 0.761, -0.2, 0.8],
    'a': [0.775, 0, 0.746, -0.229, 0.487], 'b': [0.775, 0, 0.746, -0.229, 0.8],
    'c': [0.629, 0, 0.599, -0.229, 0.487], 'd': [0.775, 0, 0.746, -0.229, 0.8],
    'e': [0.745, 0, 0.716, -0.229, 0.487], 'f': [0.618, 0, 0.588, -0.2, 0.815],
    'g': [0.775, 0, 0.746, -0.572, 0.487], 'h': [0.671, 0, 0.642, -0.2, 0.815],
    'i': [0.31, 0, 0.281, -0.2, 0.8], 'j': [0.581, 0, 0.552, -0.562, 0.8],
    'k': [0.746, 0, 0.716, -0.2, 0.815], 'l': [0.31, 0, 0.281, -0.2, 0.815],
    'm': [1.06, 0, 1.03, -0.2, 0.501], 'n': [0.686, 0, 0.657, -0.2, 0.501],
    'o': [0.746, 0, 0.716, -0.229, 0.487], 'p': [0.775, 0, 0.746, -0.542, 0.487],
    'q': [0.775, 0, 0.746, -0.542, 0.487], 'r': [0.537, 0, 0.507, -0.2, 0.472],
    's': [0.524, 0, 0.495, -0.229, 0.501], 't': [0.608, 0, 0.578, -0.2, 0.664],
    'u': [0.669, 0, 0.64, -0.229, 0.472], 'v': [0.853, 0, 0.824, -0.2, 0.472],
    'w': [1.088, 0, 1.059, -0.2, 0.472], 'x': [0.746, 0, 0.716, -0.2, 0.472],
    'y': [0.807, 0, 0.778, -0.553, 0.472], 'z': [0.627, 0, 0.597, -0.2, 0.472],
    '0': [0.849, 0, 0.82, -0.229, 0.815], '1': [0.403, 0, 0.373, -0.2, 0.8],
    '2': [0.731, 0, 0.701, -0.2, 0.815], '3': [0.744, 0, 0.714, -0.229, 0.815],
    '4': [0.76, 0, 0.731, -0.214, 0.8], '5': [0.742, 0, 0.712, -0.229, 0.8],
    '6': [0.85, 0, 0.821, -0.229, 0.8], '7': [0.76, 0, 0.731, -0.214, 0.8],
    '8': [0.82, 0, 0.791, -0.229, 0.815], '9': [0.839, 0, 0.809, -0.2, 0.8],
    ' ': [0.425, 0, 0, 0, 0], '$': [0.69, 0, 0.66, -0.409, 0.98],
    '&': [1.319, 0.075, 1.244, -0.229, 0.815], "'": [0.358, 0.075, 0.284, 0.352, 0.711],
    '!': [0.43, 0.075, 0.356, -0.2, 0.8], '?': [0.72, 0.075, 0.646, -0.2, 0.815],
    '-': [0.707, 0.075, 0.632, 0.011, 0.246], '.': [0.433, 0.075, 0.358, -0.214, 0.069],
    ',': [0.433, 0.075, 0.358, -0.343, 0.069],
  },
};

// The label face (BrandFonts.serifDisplay): BethanyElingston.otf. Vertical metrics from hhea (USE_TYPO_METRICS is not set).
export const BETHANY_ELINGSTON: FontMetrics = {
  ascent: 0.884,
  descent: 0.26,
  glyphs: {
    'A': [0.683, 0.005, 0.678, 0, 0.884], 'B': [0.607, 0.013, 0.602, 0, 0.884],
    'C': [0.618, 0.005, 0.613, -0.017, 0.884], 'D': [0.675, 0.013, 0.67, 0, 0.884],
    'E': [0.567, 0.013, 0.564, 0, 0.884], 'F': [0.565, 0.013, 0.56, 0, 0.884],
    'G': [0.701, 0.005, 0.696, -0.017, 0.884], 'H': [0.707, 0.013, 0.703, 0, 0.884],
    'I': [0.258, 0.013, 0.254, 0, 0.884], 'J': [0.505, 0.006, 0.501, -0.017, 0.884],
    'K': [0.67, 0.013, 0.666, 0, 0.884], 'L': [0.597, 0.013, 0.593, 0, 0.884],
    'M': [0.83, 0.013, 0.826, 0, 0.884], 'N': [0.739, 0.013, 0.728, -0.017, 0.884],
    'O': [0.657, 0.005, 0.652, -0.017, 0.884], 'P': [0.601, 0.013, 0.596, 0, 0.884],
    'Q': [0.667, 0.005, 0.681, -0.19, 0.884], 'R': [0.661, 0.013, 0.657, 0, 0.884],
    'S': [0.511, 0.015, 0.506, -0.017, 0.884], 'T': [0.638, 0.004, 0.634, 0, 0.884],
    'U': [0.724, 0.014, 0.72, -0.017, 0.884], 'V': [0.688, 0.005, 0.683, -0.017, 0.884],
    'W': [0.99, 0.005, 0.985, -0.017, 0.884], 'X': [0.678, 0.013, 0.673, 0, 0.884],
    'Y': [0.742, 0.005, 0.736, 0, 0.884], 'Z': [0.571, 0.005, 0.568, 0, 0.884],
    'a': [0.503, 0.006, 0.5, -0.017, 0.583], 'b': [0.582, 0.013, 0.577, -0.017, 0.884],
    'c': [0.472, 0.005, 0.467, -0.017, 0.583], 'd': [0.575, 0.005, 0.572, -0.017, 0.884],
    'e': [0.472, 0.005, 0.466, -0.017, 0.583], 'f': [0.439, 0, 0.438, 0, 0.884],
    'g': [0.541, 0, 0.541, -0.26, 0.72], 'h': [0.582, 0, 0.577, 0, 0.884],
    'i': [0.253, 0, 0.25, 0, 0.79], 'j': [0.276, -0.124, 0.202, -0.26, 0.79],
    'k': [0.57, 0, 0.567, 0, 0.884], 'l': [0.253, 0, 0.25, 0, 0.884],
    'm': [0.873, 0, 0.87, 0, 0.583], 'n': [0.58, 0, 0.577, 0, 0.583],
    'o': [0.494, 0.005, 0.489, -0.017, 0.583], 'p': [0.58, 0, 0.575, -0.26, 0.583],
    'q': [0.572, 0.005, 0.572, -0.26, 0.583], 'r': [0.447, 0, 0.442, 0, 0.583],
    's': [0.409, 0.005, 0.404, -0.017, 0.583], 't': [0.35, 0.005, 0.341, -0.017, 0.728],
    'u': [0.576, 0, 0.573, -0.017, 0.583], 'v': [0.559, 0, 0.559, -0.017, 0.57],
    'w': [0.812, 0, 0.812, -0.017, 0.57], 'x': [0.534, 0.013, 0.534, 0, 0.57],
    'y': [0.569, 0, 0.569, -0.26, 0.57], 'z': [0.432, 0.013, 0.429, 0, 0.57],
    '0': [0.551, 0.016, 0.535, -0.017, 0.857], '1': [0.308, 0.021, 0.278, 0, 0.857],
    '2': [0.527, 0.015, 0.507, 0, 0.857], '3': [0.514, 0.016, 0.493, -0.017, 0.857],
    '4': [0.574, 0.02, 0.554, 0, 0.857], '5': [0.534, 0.016, 0.514, -0.017, 0.857],
    '6': [0.53, 0.016, 0.514, -0.017, 0.857], '7': [0.522, 0.015, 0.517, -0.017, 0.857],
    '8': [0.532, 0.015, 0.516, -0.018, 0.858], '9': [0.53, 0.016, 0.514, -0.017, 0.857],
    ' ': [0.19, 0, 0, 0, 0], '$': [0.49, 0.022, 0.485, -0.082, 0.933],
    '&': [0.688, 0.015, 0.702, -0.016, 0.857], "'": [0.168, 0.03, 0.138, 0.661, 0.884],
    '!': [0.153, 0.015, 0.138, -0.002, 0.824], '?': [0.434, 0.015, 0.42, -0.002, 0.819],
    '-': [0.339, 0.03, 0.309, 0.355, 0.395], '.': [0.153, 0.015, 0.138, -0.017, 0.121],
    ',': [0.154, 0.015, 0.138, -0.079, 0.121],
  },
};

// A character missing from a table: a wide letter of full height, so a guess
// can only make the words smaller, never too big for their sticker.
function glyphOf(font: FontMetrics, char: string): Glyph {
  return font.glyphs[char] ?? [0.95, 0, 0.95, -font.descent, font.ascent];
}

// A line's advance width, in ems: what Android centres a line by.
function lineAdvance(font: FontMetrics, line: string): number {
  let total = 0;
  for (const char of line) total += glyphOf(font, char)[0];
  return total;
}

// A line's inked width, in ems: from the first glyph's ink to the last's.
export function inkWidth(font: FontMetrics, line: string): number {
  let pen = 0;
  let left = Infinity;
  let right = -Infinity;
  for (const char of line) {
    const [advance, xMin, xMax] = glyphOf(font, char);
    if (xMax > xMin) {
      left = Math.min(left, pen + xMin);
      right = Math.max(right, pen + xMax);
    }
    pen += advance;
  }
  return right > left ? right - left : 0;
}

// The biggest size in [0, cap] that `fits` accepts. `fits` has to be
// monotonic: true up to some size and false beyond it, which holds for text
// growing about a fixed middle inside a fixed shape.
function largest(cap: number, fits: (size: number) => boolean): number {
  if (fits(cap)) return cap;
  let lo = 0;
  let hi = cap;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

// --- Cut lettering ---------------------------------------------------------

// The lettering face sets its capitals 0.2 em below the baseline: their ink
// runs from -0.23 to 0.82 em, round letters' overshoot included. The face's
// own ascent and descent (0.8 and 0.2) put that ink in the middle of its line
// box to within 0.007 em, so it needs no nudging to sit centred.
const CAPITALS = { top: 0.815, bottom: -0.229 };
// The pitch of the lines of a two-line word. A capital's ink is 1.04 em tall,
// so any tighter and the lines run into each other.
const LETTERING_LINE = 1.05;

export type LetteringLayout = {
  fontSize: number;
  lineHeight: number;
  // The ink's size, in points.
  width: number;
  height: number;
};

// Lettering as large as fits `room` points across and down, but never above
// `cap`, so a short word does not swell to fill its whole box.
export function fitLettering(lines: string[], room: number, cap: number): LetteringLayout {
  const widest = Math.max(...lines.map((line) => inkWidth(MOONGET_HEAVY, line)));
  const tall = (lines.length - 1) * LETTERING_LINE + (CAPITALS.top - CAPITALS.bottom);
  const fontSize = Math.max(0, Math.min(cap, room / Math.max(widest, 0.01), room / tall));
  return {
    fontSize,
    lineHeight: fontSize * LETTERING_LINE,
    width: widest * fontSize,
    height: tall * fontSize,
  };
}

// --- Oval labels -----------------------------------------------------------

// The pitch of a two-line label's lines, in ems.
const LABEL_LINE = 1.08;

// The clear inside of a label, in points, centred on the sticker.
export type LabelShape = {
  // Inside the keyline: a pill this wide and tall, its ends fully round.
  width: number;
  height: number;
  // The two printed dots, at (±dotX, 0).
  dotX: number;
  dotRadius: number;
  // How near the ink may come to the keyline or to a dot.
  margin: number;
};

export type LabelLayout = {
  fontSize: number;
  lineHeight: number;
  // How far to move the text down so its ink, not its line box, is centred.
  shiftY: number;
  // Padding above and below the text. A line box is shorter than this face's
  // ascent plus descent, so without it the first line's capitals and the
  // last line's descenders would hang outside the text's own box.
  padding: number;
};

// A label's words, as large as they go with every glyph inside the keyline
// and clear of both dots.
//
// The size is capped by the face's whole ascent and descent rather than by
// the letters actually present, so "Cozy" and "Shh" come out the same size
// instead of whichever has no descender growing to fill the pill. Within
// that, each label's own ink is what gets centred and what is checked
// against the shape, corner by corner, round ends included.
export function fitLabel(lines: string[], shape: LabelShape): LabelLayout {
  const font = BETHANY_ELINGSTON;
  const { ascent, descent } = font;
  const count = lines.length;
  // Where line j's baseline is, down from the top of the text's box.
  const baseline = (j: number) => (LABEL_LINE + ascent - descent) / 2 + j * LABEL_LINE;
  const glyphs = (line: string) => [...line].map((char) => glyphOf(font, char)).filter((g) => g[2] > g[1]);
  const inkTop = baseline(0) - Math.max(...glyphs(lines[0]).map((g) => g[4]));
  const inkBottom = baseline(count - 1) - Math.min(...glyphs(lines[count - 1]).map((g) => g[3]));
  // Moves the ink's middle onto the box's middle, which is the label's.
  const shift = (count * LABEL_LINE) / 2 - (inkTop + inkBottom) / 2;

  // Every glyph's ink box at a size of 1, relative to the label's middle.
  const boxTop = -(count * LABEL_LINE) / 2 + shift;
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  lines.forEach((line, j) => {
    let pen = -lineAdvance(font, line) / 2;
    for (const char of line) {
      const [advance, xMin, xMax, yMin, yMax] = glyphOf(font, char);
      if (xMax > xMin) {
        boxes.push({
          x0: pen + xMin,
          x1: pen + xMax,
          y0: boxTop + baseline(j) - yMax,
          y1: boxTop + baseline(j) - yMin,
        });
      }
      pen += advance;
    }
  });

  const radius = shape.height / 2 - shape.margin;
  const straight = shape.width / 2 - shape.height / 2;
  const insidePill = (x: number, y: number) => {
    const over = Math.abs(x) - straight;
    return over <= 0 ? Math.abs(y) <= radius : over * over + y * y <= radius * radius;
  };
  const clearOfDots = (x0: number, x1: number, y0: number, y1: number) =>
    [-shape.dotX, shape.dotX].every((dotX) => {
      const nearX = Math.min(Math.max(dotX, x0), x1);
      const nearY = Math.min(Math.max(0, y0), y1);
      return Math.hypot(dotX - nearX, nearY) >= shape.dotRadius + shape.margin;
    });
  const fits = (size: number) =>
    boxes.every(({ x0, x1, y0, y1 }) => {
      const [left, right, top, bottom] = [x0 * size, x1 * size, y0 * size, y1 * size];
      return (
        insidePill(left, top) &&
        insidePill(right, top) &&
        insidePill(left, bottom) &&
        insidePill(right, bottom) &&
        clearOfDots(left, right, top, bottom)
      );
    });

  const cap = (shape.height - 2 * shape.margin) / ((count - 1) * LABEL_LINE + ascent + descent);
  const fontSize = largest(Math.max(cap, 0), fits);
  return {
    fontSize,
    lineHeight: fontSize * LABEL_LINE,
    shiftY: shift * fontSize,
    padding: Math.max(0, (ascent + descent - LABEL_LINE) / 2) * fontSize + 1,
  };
}

// --- A stamp's rim ---------------------------------------------------------

// Clear card between neighbouring letters, in ems, measured where they come
// closest: along their inner edge, which is shorter than their middle.
const ARC_TRACKING = 0.06;
// The most of the circle the words may take, in radians: round the top and
// about a third of the way down each side, the way a rubber stamp runs its
// words, still well clear of the dots along the bottom. The ten-letter rims
// ("UNDERRATED") are the ones this limits; the short ones fill the band's
// depth first.
const ARC_SPAN = 4.3;
const ARC_LINE = 1.2;

export type ArcLayout = {
  fontSize: number;
  lineHeight: number;
  // How far from the stamp's middle each letter's box is centred, in points.
  radius: number;
  // Each character and where it goes, in radians clockwise from straight up.
  glyphs: { char: string; angle: number }[];
};

// Words round a stamp's rim, in the band between its inner ring and its rim
// (`inner` and `outer`, the clear radii, in points): as large as fits the
// band's depth and ARC_SPAN of the circle, with the letters spaced by their
// own widths so that no two touch even along their inner edge.
//
// Each letter is a straight block turned to face out, so its bottom corners
// reach further round the circle than its middle does. That is where
// neighbours meet first, and what the spacing is worked out at.
export function fitArc(text: string, inner: number, outer: number): ArcLayout {
  const font = MOONGET_HEAVY;
  const chars = [...text];
  const inkHeight = CAPITALS.top - CAPITALS.bottom;
  const middle = (inner + outer) / 2;
  // A letter's inked width in ems; a space, which has no ink, its advance.
  const widths = chars.map((char) => {
    const [advance, xMin, xMax] = glyphOf(font, char);
    return xMax > xMin ? xMax - xMin : advance;
  });

  const layoutAt = (size: number) => {
    const edge = middle - (inkHeight / 2) * size;
    if (edge <= 0) return null;
    const half = (width: number) => Math.atan((width * size) / 2 / edge);
    const gap = (ARC_TRACKING * size) / edge;
    const angles = [0];
    for (let i = 1; i < chars.length; i++) {
      angles.push(angles[i - 1] + half(widths[i - 1]) + gap + half(widths[i]));
    }
    const first = half(widths[0]);
    const last = half(widths[chars.length - 1]);
    return { angles, start: -first, end: angles[chars.length - 1] + last };
  };

  const cap = Math.max(0, (outer - inner) / inkHeight);
  const fontSize = largest(cap, (size) => {
    const layout = layoutAt(size);
    return layout != null && layout.end - layout.start <= ARC_SPAN;
  });
  const layout = layoutAt(fontSize) ?? { angles: chars.map(() => 0), start: 0, end: 0 };
  const centre = (layout.start + layout.end) / 2;

  // Each box is centred so that its letter's ink, not its line box, sits on
  // the middle of the band; and turned so the ink, not the advance, is
  // centred on its angle.
  const { ascent, descent } = font;
  const inkLift = (CAPITALS.top + CAPITALS.bottom) / 2 - (ascent - descent) / 2;
  return {
    fontSize,
    lineHeight: fontSize * ARC_LINE,
    radius: middle - inkLift * fontSize,
    glyphs: chars.map((char, i) => {
      const [advance, xMin, xMax] = glyphOf(font, char);
      const offInk = xMax > xMin ? ((xMin + xMax) / 2 - advance / 2) * fontSize : 0;
      return { char, angle: layout.angles[i] - centre - offInk / middle };
    }),
  };
}

export type CentreLayout = {
  fontSize: number;
  lineHeight: number;
  shiftY: number;
};

// A short word or sign in the middle of a stamp, as large as fits inside a
// circle of `radius` points, with its ink centred.
export function fitStampCentre(text: string, radius: number): CentreLayout {
  const font = MOONGET_HEAVY;
  const glyphs = [...text].map((char) => glyphOf(font, char)).filter((g) => g[2] > g[1]);
  const top = Math.max(...glyphs.map((g) => g[4]), CAPITALS.top);
  const bottom = Math.min(...glyphs.map((g) => g[3]), CAPITALS.bottom);
  const width = inkWidth(font, text);
  const fontSize = Math.max(0, radius / Math.hypot(width / 2, (top - bottom) / 2));
  const { ascent, descent } = font;
  return {
    fontSize,
    // Tall enough to hold all the ink, so none of it hangs outside the box.
    lineHeight: fontSize * (top - bottom + 0.1),
    shiftY: ((top + bottom) / 2 - (ascent - descent) / 2) * fontSize,
  };
}
