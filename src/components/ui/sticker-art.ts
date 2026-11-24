// Illustrated stickers: one drawing per tag, for the tags a picture says by
// itself. A dog is "pet friendly" and a takeaway cup is "good coffee" without
// a word on them, the way a real sticker sheet works. Tags that are an idea
// rather than a thing ("hidden gem", "overrated") have no drawing here and
// stay lettered (see TagStickerGraphic).
//
// Drawn the way a printed vinyl sticker is: flat spot colours, a warm dark
// outline rather than black, each colour landing a hair out of register with
// its outline, and a white die-cut margin that follows the drawing's own
// silhouette. These replace Ionicons glyphs on generic badge shapes, which
// read as an app's interface icons with a sticker drawn round them.
//
// Every drawing is on a 100 x 100 grid. Kept free of Skia on purpose: one GL
// canvas per sticker overloaded the GPU before. These become one SVG image.

const INK = '#2b2320';
const CREAM = '#f6f1df';
const PAPER = '#fbf7ec';
const AMBER = '#e0a458';
const GOLD = '#f2c46b';
const TERRA = '#c96a5b';
const RED = '#d8604f';
const SLATE = '#6b8fb5';
const SKY = '#9fc3d6';
const SAGE = '#a0bd91';
const LEAF = '#8fb46e';
const TEAL = '#7fae9e';
const PLUM = '#b58bbd';
const BROWN = '#8a5a3b';
const KRAFT = '#c58b52';
const TAN = '#d9a066';

// Something laid over a part's colour before its outline is drawn, so the
// outline stays on top: shading, a highlight, a stripe.
type Mark = { d: string; fill?: string; stroke?: string; w?: number; opacity?: number };

type Part = {
  d: string;
  // The colour inside it. None for a line on its own (steam, a mast).
  fill?: string;
  // The outline's width. 0 for none.
  line?: number;
  marks?: Mark[];
  // Drawn as a thick stroke along d, with an outline either side: a brush
  // handle, a chopstick.
  tube?: { colour: string; width: number };
  // Whether the die-cut margin goes round it. Off for small pieces that sit
  // inside another part anyway.
  cut?: boolean;
};

// Circle and rounded-rectangle paths, since everything is drawn as paths.
function C(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
}

function E(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
}

function R(x: number, y: number, w: number, h: number, r = 0): string {
  if (r === 0) return `M${x} ${y} h${w} v${h} h${-w} Z`;
  return (
    `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} ` +
    `H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`
  );
}

// A four-pointed glint.
function glint(x: number, y: number, k: number): string {
  return `M${x} ${y - k} Q${x + k * 0.18} ${y - k * 0.18} ${x + k} ${y} Q${x + k * 0.18} ${y + k * 0.18} ${x} ${y + k} Q${x - k * 0.18} ${y + k * 0.18} ${x - k} ${y} Q${x - k * 0.18} ${y - k * 0.18} ${x} ${y - k} Z`;
}

function star(cx: number, cy: number, r: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
  }
  return `${d}Z`;
}

function drop(x: number, y: number): string {
  return `M${x} ${y - 6} Q${x + 5} ${y + 1} ${x} ${y + 4.5} Q${x - 5} ${y + 1} ${x} ${y - 6} Z`;
}

const ART: Record<string, Part[]> = {
  'good-coffee': [
    { d: 'M44 20 C40 16, 48 13, 44 7', line: 3 },
    { d: 'M56 20 C52 16, 60 13, 56 7', line: 3 },
    { d: 'M31 32 Q32 24 40 24 L60 24 Q68 24 69 32 Z', fill: '#e6dfcf' },
    { d: 'M26 32 L74 32 Q77 32 77 35 L77 38 Q77 41 74 41 L26 41 Q23 41 23 38 L23 35 Q23 32 26 32 Z', fill: '#efe9dc' },
    {
      d: 'M28 41 L72 41 L66.5 91 Q66 94 62.5 94 L37.5 94 Q34 94 33.5 91 Z',
      fill: PAPER,
      marks: [{ d: 'M61 41 L72 41 L66.5 91 Q66 94 62.5 94 L57 94 Z', fill: '#e6decb' }],
    },
    { d: 'M29.6 55 L70.4 55 L68 77 L32 77 Z', fill: KRAFT, marks: [{ d: 'M60 55 L70.4 55 L68 77 L58 77 Z', fill: '#ad7643' }] },
    { d: C(50, 66, 5.5), fill: PAPER, line: 2, cut: false },
  ],
  'pet-friendly': [
    { d: 'M30 30 C18 30, 12 48, 16 62 C18 70, 28 68, 31 58 Z', fill: BROWN },
    { d: 'M70 30 C82 30, 88 48, 84 62 C82 70, 72 68, 69 58 Z', fill: BROWN },
    {
      d: 'M50 22 C68 22, 74 36, 73 52 C72 70, 62 82, 50 82 C38 82, 28 70, 27 52 C26 36, 32 22, 50 22 Z',
      fill: TAN,
      marks: [
        { d: E(40, 47, 8, 9), fill: BROWN },
        { d: E(33, 63, 4, 2.6), fill: '#e59a8c', opacity: 0.7 },
        { d: E(67, 63, 4, 2.6), fill: '#e59a8c', opacity: 0.7 },
      ],
    },
    { d: E(50, 67, 14, 11), fill: '#f3e3c8', line: 2.4, cut: false },
    { d: C(40, 48, 3.4), fill: INK, line: 0, cut: false, marks: [{ d: C(41.2, 46.8, 1.1), fill: '#ffffff' }] },
    { d: C(60, 48, 3.4), fill: INK, line: 0, cut: false, marks: [{ d: C(61.2, 46.8, 1.1), fill: '#ffffff' }] },
    { d: 'M47 71 Q47 79 50.5 79 Q54 79 54 71 Z', fill: '#e07a6e', line: 2.2, cut: false },
    { d: 'M50 64 L50 69 M50 69 Q46 73 42 70 M50 69 Q54 73 58 70', line: 2.4, cut: false },
    { d: 'M44 59 Q50 55 56 59 Q55 64 50 65 Q45 64 44 59 Z', fill: INK, line: 0, cut: false },
  ],
  'great-cocktails': [
    { d: 'M62 12 L42 46', line: 2.6 },
    { d: 'M18 24 L82 24 L50 60 Z', fill: '#dcecef', marks: [{ d: 'M25 31 L75 31 L50 58 Z', fill: '#e59a8c' }, { d: 'M27 27 L37 38', stroke: '#ffffff', w: 2.6, opacity: 0.9 }] },
    { d: C(46, 39, 6), fill: '#9bb35a', marks: [{ d: C(46, 39, 2.2), fill: TERRA }] },
    { d: 'M50 60 L50 84', line: 3.4 },
    { d: E(50, 86, 15, 4), fill: '#dcecef' },
  ],
  bar: [
    { d: 'M70 44 C90 44, 90 80, 70 80 L70 72 C80 72, 80 52, 70 52 Z', fill: '#f3e7c4' },
    {
      d: R(26, 38, 46, 54, 5),
      fill: '#e8b34e',
      marks: [
        { d: 'M36 50 L36 82', stroke: '#ffffff', w: 3, opacity: 0.5 },
        { d: 'M46 50 L46 82', stroke: '#ffffff', w: 2, opacity: 0.3 },
        { d: R(62, 38, 10, 54, 4), fill: '#d39a35' },
        { d: C(55, 62, 1.8), fill: '#ffffff', opacity: 0.7 },
        { d: C(59, 72, 1.3), fill: '#ffffff', opacity: 0.7 },
        { d: C(51, 77, 1.5), fill: '#ffffff', opacity: 0.7 },
      ],
    },
    {
      d: 'M24 38 C20 30, 28 22, 36 26 C38 18, 52 16, 56 24 C62 18, 74 22, 72 32 C78 34, 77 42, 70 42 L41 42 Q41 51 37.5 51 Q34 51 34 42 L28 42 C24 42, 22 40, 24 38 Z',
      fill: PAPER,
    },
  ],
  'perfect-sunset': [
    {
      d: C(50, 50, 40),
      fill: GOLD,
      marks: [
        { d: 'M32 60 A18 18 0 0 1 68 60 Z', fill: '#e8774f' },
        { d: 'M11.3 60 L88.7 60 A40 40 0 0 1 11.3 60 Z', fill: SLATE },
        { d: 'M37 66 L63 66', stroke: GOLD, w: 3 },
        { d: 'M42 72 L58 72', stroke: GOLD, w: 3 },
        { d: 'M46 78 L54 78', stroke: GOLD, w: 3 },
        { d: 'M18 40 Q28 35 40 40', stroke: PAPER, w: 3, opacity: 0.85 },
        { d: 'M62 30 Q71 26 82 31', stroke: PAPER, w: 3, opacity: 0.85 },
        { d: 'M60 22 q3 -3 6 0 q3 -3 6 0', stroke: INK, w: 2 },
        { d: 'M11.3 60 L88.7 60', stroke: INK, w: 2.2 },
      ],
    },
  ],
  'mountain-views': [
    { d: C(72, 28, 9), fill: GOLD },
    {
      d: 'M10 82 L42 24 L74 82 Z',
      fill: SLATE,
      marks: [{ d: 'M42 24 L74 82 L52 82 L46 52 Z', fill: '#557797' }],
    },
    { d: 'M42 24 L51.9 42 L47 38.5 L42.5 43 L37.5 38.5 L32.6 41 Z', fill: PAPER, line: 2.4, cut: false },
    { d: 'M48 82 L70 44 L92 82 Z', fill: TEAL, marks: [{ d: 'M70 44 L92 82 L76 82 L72 60 Z', fill: '#64927f' }] },
    { d: 'M70 44 L75.8 54 L72.5 52 L69.5 55.5 L66.5 52 L64.2 54 Z', fill: PAPER, line: 2.4, cut: false },
    { d: 'M6 82 Q50 77 96 82 L96 87 Q50 91 6 87 Z', fill: SAGE },
  ],
  'open-water': [
    {
      d: 'M8 88 L8 70 C18 68, 24 52, 36 42 C48 32, 68 30, 80 40 C88 47, 86 60, 76 62 C68 63, 64 56, 68 52 C71 49, 76 51, 75 55 C80 48, 72 40, 62 42 C50 44, 44 56, 46 66 C48 76, 58 80, 70 80 L92 80 L92 88 Z',
      fill: SLATE,
      marks: [
        { d: 'M28 50 C40 38, 60 32, 76 40', stroke: PAPER, w: 3.2 },
        { d: 'M14 72 C22 70, 28 60, 34 54', stroke: SKY, w: 2.6 },
        { d: 'M54 84 Q60 81 66 84 T78 84', stroke: SKY, w: 2.4 },
      ],
    },
    { d: C(84, 20, 3), fill: PAPER, line: 2 },
    { d: C(76, 14, 2), fill: PAPER, line: 1.8 },
  ],
  'great-trails': [
    { d: R(46, 28, 8, 62, 1), fill: BROWN },
    { d: 'M26 20 L70 20 L80 29 L70 38 L26 38 Z', fill: AMBER, marks: [{ d: 'M32 29 L62 29', stroke: '#c88a3c', w: 1.8 }] },
    { d: 'M74 44 L30 44 L20 53 L30 62 L74 62 Z', fill: SAGE, marks: [{ d: 'M38 53 L68 53', stroke: '#86a576', w: 1.8 }] },
    { d: C(50, 29, 1.7), fill: INK, line: 0, cut: false },
    { d: C(50, 53, 1.7), fill: INK, line: 0, cut: false },
    { d: 'M34 92 Q38 82 41 92 Q45 80 50 92 Q55 81 59 92 Q62 83 66 92 Z', fill: TEAL },
  ],
  waterfront: [
    { d: 'M50 14 L50 64', line: 3.2 },
    { d: 'M50 14 L61 17.5 L50 21 Z', fill: TERRA, line: 2.2 },
    { d: 'M53 20 L53 60 L80 60 Z', fill: PAPER },
    { d: 'M47 26 L47 60 L24 60 Z', fill: GOLD },
    { d: 'M20 64 L80 64 L71 77 L29 77 Z', fill: TERRA, marks: [{ d: 'M24 69 L76 69', stroke: PAPER, w: 2.6 }] },
    { d: 'M8 78 Q16 74 24 78 T40 78 T56 78 T72 78 T92 78 L92 86 Q50 91 8 86 Z', fill: SLATE },
  ],
  'green-space': [
    { d: 'M46 62 L43 88 L57 88 L54 62 Z', fill: BROWN },
    {
      d: 'M50 12 C62 12, 68 20, 68 26 C78 28, 82 38, 78 46 C84 54, 78 66, 66 64 C62 72, 50 72, 46 66 C36 72, 22 66, 24 56 C14 52, 16 38, 26 36 C24 24, 36 14, 50 12 Z',
      fill: LEAF,
      marks: [
        { d: 'M78 46 C84 54, 78 66, 66 64 C62 72, 50 72, 46 66 C58 64, 72 58, 78 46 Z', fill: '#729a55' },
        { d: E(37, 30, 6, 3.5), fill: '#b9d495' },
        { d: E(56, 24, 4, 2.4), fill: '#b9d495' },
      ],
    },
    { d: C(60, 40, 2.8), fill: TERRA, line: 1.8, cut: false },
    { d: C(38, 50, 2.8), fill: TERRA, line: 1.8, cut: false },
    { d: C(66, 54, 2.4), fill: TERRA, line: 1.8, cut: false },
    { d: E(50, 89, 22, 3.5), fill: SAGE },
  ],
  wildlife: [
    { d: 'M28 44 L24 12 L46 30 Z', fill: '#d9773f', marks: [{ d: 'M30 38 L28 20 L40 31 Z', fill: INK }] },
    { d: 'M72 44 L76 12 L54 30 Z', fill: '#d9773f', marks: [{ d: 'M70 38 L72 20 L60 31 Z', fill: INK }] },
    {
      d: 'M50 30 C64 30, 78 36, 80 46 C82 56, 66 72, 50 86 C34 72, 18 56, 20 46 C22 36, 36 30, 50 30 Z',
      fill: '#e0864a',
      marks: [
        { d: 'M20 46 C26 50, 38 52, 44 62 C46 70, 50 76, 50 86 C34 72, 18 56, 20 46 Z', fill: PAPER },
        { d: 'M80 46 C74 50, 62 52, 56 62 C54 70, 50 76, 50 86 C66 72, 82 56, 80 46 Z', fill: PAPER },
      ],
    },
    { d: E(38, 51, 2.8, 3.6), fill: INK, line: 0, cut: false },
    { d: E(62, 51, 2.8, 3.6), fill: INK, line: 0, cut: false },
    { d: 'M45.5 79 Q50 76 54.5 79 Q52.5 84.5 50 84.5 Q47.5 84.5 45.5 79 Z', fill: INK, line: 0, cut: false },
  ],
  stargazing: [
    {
      d: 'M44.15 20 A30 30 0 1 0 69.93 65.1 A26 26 0 0 1 44.15 20 Z',
      fill: GOLD,
      marks: [
        { d: C(28, 52, 3.6), fill: '#d9a64e' },
        { d: C(37, 67, 2.6), fill: '#d9a64e' },
        { d: C(30, 36, 2), fill: '#d9a64e' },
      ],
    },
    { d: star(76, 26, 10), fill: PAPER },
    { d: star(84, 52, 6), fill: GOLD },
    { d: glint(62, 84, 5), fill: PAPER, line: 2 },
  ],
  'live-music': [
    { d: 'M38 26 L80 16 L80 27 L38 37 Z', fill: PLUM },
    { d: R(37, 30, 5, 44, 1), fill: PLUM },
    { d: R(75, 20, 5, 44, 1), fill: PLUM },
    { d: 'M22.6 77.4 A10 7.5 -20 1 0 41.4 70.6 A10 7.5 -20 1 0 22.6 77.4 Z', fill: PLUM, marks: [{ d: E(29, 72, 3, 1.6), fill: '#ffffff', opacity: 0.6 }] },
    { d: 'M60.6 69.4 A10 7.5 -20 1 0 79.4 62.6 A10 7.5 -20 1 0 60.6 69.4 Z', fill: PLUM, marks: [{ d: E(67, 64, 3, 1.6), fill: '#ffffff', opacity: 0.6 }] },
    { d: 'M88 38 q5 5 0 10', line: 2.6 },
    { d: 'M14 46 q-5 5 0 10', line: 2.6 },
  ],
  // A mirror ball, seen side on: its poles at the top and bottom of the
  // circle, so the rows of tiles run level and the columns are half ellipses
  // through the poles, spaced as they are round a real sphere (30 degrees
  // apart, so the outer ones lie close to the edge). It used to have its
  // columns crowded into the middle third and its rows bowed away from the
  // middle, which read as a pinched onion rather than a ball. The cord is
  // short: the sticker is centred and spaced by its whole outline, and a long
  // cord sat the ball itself well below the middle of its square.
  'night-out': [
    { d: 'M50 9 L50 16', line: 2.6 },
    { d: R(44, 14, 12, 7, 2), fill: '#b9b2a2' },
    {
      d: C(50, 53, 32),
      fill: '#c9cfd6',
      marks: [
        { d: 'M50 85 A32 32 0 0 0 82 53 Q72 78 50 85 Z', fill: '#a9b1bb' },
        // Rows, at 25 and 52 degrees either side of the equator.
        { d: 'M30.3 27.8 H69.7', stroke: '#8e97a2', w: 1.6 },
        { d: 'M21 39.5 H79', stroke: '#8e97a2', w: 1.6 },
        { d: 'M18 53 H82', stroke: '#8e97a2', w: 1.6 },
        { d: 'M21 66.5 H79', stroke: '#8e97a2', w: 1.6 },
        { d: 'M30.3 78.2 H69.7', stroke: '#8e97a2', w: 1.6 },
        // Columns: the middle one, and 30 and 60 degrees round each way.
        { d: 'M50 21 L50 85', stroke: '#8e97a2', w: 1.6 },
        { d: 'M50 21 A16 32 0 0 0 50 85', stroke: '#8e97a2', w: 1.6 },
        { d: 'M50 21 A16 32 0 0 1 50 85', stroke: '#8e97a2', w: 1.6 },
        { d: 'M50 21 A27.7 32 0 0 0 50 85', stroke: '#8e97a2', w: 1.6 },
        { d: 'M50 21 A27.7 32 0 0 1 50 85', stroke: '#8e97a2', w: 1.6 },
        // Tiles catching the light, each inside one cell of that grid.
        { d: R(53.5, 30.5, 6, 6), fill: '#ffffff' },
        { d: R(38, 42.5, 6, 6), fill: '#e7d3ee' },
        { d: R(56, 56.5, 6, 6), fill: '#cfe6f2' },
        { d: R(40, 69.5, 5, 5), fill: '#f6e2b0' },
      ],
    },
    { d: glint(14, 24, 7), fill: GOLD, line: 2 },
    { d: glint(88, 34, 5), fill: GOLD, line: 2 },
  ],
  romantic: [
    {
      d: 'M50 84 C30 70, 12 56, 14 38 C16 24, 30 18, 40 22 C45 24, 48 28, 50 32 C52 28, 55 24, 60 22 C70 18, 84 24, 86 38 C88 56, 70 70, 50 84 Z',
      fill: RED,
      marks: [
        { d: 'M86 38 C88 56, 70 70, 50 84 C64 70, 80 58, 86 38 Z', fill: '#b84a3c' },
        { d: 'M24 36 Q26 29 33 27', stroke: PAPER, w: 3.4 },
        { d: C(23, 43, 1.9), fill: PAPER },
      ],
    },
  ],
  historic: [
    { d: C(50, 50, 41), fill: TEAL, marks: [{ d: 'M50 91 A41 41 0 0 0 91 50 Q82 80 50 91 Z', fill: '#64927f' }] },
    { d: 'M16 38 L50 16 L84 38 Z', fill: '#efe6d0', marks: [{ d: C(50, 30, 3.5), fill: '#d9ccae' }] },
    { d: R(18, 38, 64, 7), fill: '#ddd0b2' },
    ...[23, 37, 51, 65].map((x) => ({ d: R(x, 45, 8, 31), fill: '#f4ecd8', marks: [{ d: `M${x + 4} 49 L${x + 4} 72`, stroke: '#c9bb9a', w: 1.4 }] })),
    { d: R(16, 76, 68, 6), fill: '#ddd0b2' },
    { d: R(12, 82, 76, 6), fill: '#cdbf9f' },
  ],
  artsy: [
    {
      d: 'M50 16 C72 16, 88 30, 88 48 C88 64, 76 70, 66 66 C58 63, 54 70, 58 76 C62 82, 56 88, 46 88 C26 88, 12 72, 12 52 C12 30, 28 16, 50 16 Z',
      fill: '#e3c08d',
      marks: [{ d: 'M12 52 C12 72, 26 88, 46 88 C56 88, 60 84, 59 80 C50 84, 22 80, 12 52 Z', fill: '#c9a46f' }],
    },
    { d: C(70, 46, 6), fill: CREAM, line: 2.6, cut: false },
    { d: C(32, 38, 6.5), fill: TERRA, line: 2.4, cut: false },
    { d: C(50, 29, 6), fill: GOLD, line: 2.4, cut: false },
    { d: C(68, 28, 5.2), fill: PLUM, line: 2.4, cut: false },
    { d: C(27, 57, 6.5), fill: SLATE, line: 2.4, cut: false },
    { d: C(38, 74, 6), fill: SAGE, line: 2.4, cut: false },
    { d: 'M60 63 L63 60 L92 88 L88 92 Z', fill: BROWN },
    { d: 'M55 58 L58 55 L64 61 L61 64 Z', fill: '#b9b2a2' },
    { d: 'M58 55 L55 58 Q46 53 43 43 Q53 46 58 55 Z', fill: TERRA },
  ],
  'kid-friendly': [
    { d: 'M86 52 L90 34 L96 34', line: 3.4 },
    { d: 'M22 52 A28 28 0 0 1 50 24 L50 52 Z', fill: PLUM, marks: [{ d: 'M29 37 L50 52', stroke: '#98709f', w: 2 }, { d: 'M38 28 L50 52', stroke: '#98709f', w: 2 }] },
    { d: 'M18 52 L86 52 Q86 74 64 76 L40 76 Q18 74 18 52 Z', fill: TEAL, marks: [{ d: 'M21 59 L83 59', stroke: PAPER, w: 2.4 }] },
    { d: C(34, 84, 8), fill: PAPER, marks: [{ d: C(34, 84, 2.4), fill: INK }] },
    { d: C(70, 84, 8), fill: PAPER, marks: [{ d: C(70, 84, 2.4), fill: INK }] },
  ],
  accessible: [
    {
      d: R(14, 14, 72, 72, 12),
      fill: '#4f78a8',
      marks: [
        { d: C(52, 26, 6), fill: PAPER },
        { d: 'M50 36 L48 56 L64 56 L70 72', stroke: PAPER, w: 7 },
        { d: 'M49 44 L62 42', stroke: PAPER, w: 5.5 },
        { d: 'M32.9 56 A15 15 0 1 0 56.7 74', stroke: PAPER, w: 5 },
      ],
    },
  ],
  'good-food': [
    { d: 'M38 28 C34 22, 42 18, 38 10', line: 3 },
    { d: 'M50 26 C46 20, 54 16, 50 8', line: 3 },
    { d: 'M62 28 C58 22, 66 18, 62 10', line: 3 },
    {
      d: 'M14 46 C20 37, 80 37, 86 46 Z',
      fill: GOLD,
      marks: [
        { d: 'M24 44 q4 -4 8 0 t8 0 t8 0', stroke: AMBER, w: 2 },
        { d: E(42, 42, 6.5, 4), fill: PAPER },
        { d: C(42, 42, 2.6), fill: '#e8a33a' },
        { d: C(60, 42, 3.2), fill: LEAF },
        { d: C(68, 43, 2.4), fill: LEAF },
      ],
    },
    {
      d: 'M14 46 L86 46 C86 66, 70 82, 50 82 C30 82, 14 66, 14 46 Z',
      fill: TERRA,
      marks: [
        { d: 'M86 46 C86 66, 70 82, 50 82 C64 76, 78 64, 80 46 Z', fill: '#ad5243' },
        { d: 'M18 56 Q50 64 82 56', stroke: PAPER, w: 2.6 },
        { d: C(34, 66, 2), fill: PAPER },
        { d: C(50, 70, 2), fill: PAPER },
        { d: C(66, 66, 2), fill: PAPER },
      ],
    },
    { d: 'M56 34 L92 56', tube: { colour: KRAFT, width: 3.6 }, line: 2.2 },
    { d: 'M52 38 L90 63', tube: { colour: KRAFT, width: 3.6 }, line: 2.2 },
    { d: 'M38 82 L62 82 L60 88 L40 88 Z', fill: '#ad5243' },
  ],
  // A canvas low-top, side on: the heel and its collar, the laces running
  // down the instep with a bow on top, a rubber toe cap and a striped sole.
  walkable: [
    {
      d: 'M10 70 L12 44 Q22 51 32 43 L38 35 Q42 32 45 36 L60 51 C74 53, 88 57, 90 65 L90 70 Z',
      fill: SLATE,
      marks: [
        { d: 'M66 52 C78 54, 88 58, 90 65 L90 70 L70 70 C70 62, 68 56, 66 52 Z', fill: PAPER },
        { d: 'M10 70 L11 56 L19 56 L19 70 Z', fill: '#557797' },
        { d: C(42, 39, 1.5), fill: PAPER },
        { d: C(47, 44, 1.5), fill: PAPER },
        { d: C(52, 49, 1.5), fill: PAPER },
        { d: 'M42 39 L49 37 M47 44 L54 42 M52 49 L58 47', stroke: PAPER, w: 1.8 },
      ],
    },
    { d: 'M40 34 Q33 26 30 32 Q34 36 40 34 Q47 26 50 32 Q46 36 40 34 Z', fill: PAPER, line: 2.2 },
    { d: 'M40 34 L36 41 M40 34 L44 41', line: 2 },
    {
      d: 'M8 70 L91 70 Q95 70 95 75 Q95 82 89 82 L11 82 Q5 82 5 76 Q5 70 8 70 Z',
      fill: PAPER,
      marks: [{ d: 'M7 75.5 L93 75.5', stroke: TERRA, w: 2.4 }],
    },
  ],
  'high-end': [
    {
      d: 'M30 24 L70 24 L88 42 L50 86 L12 42 Z',
      fill: '#a8d6e0',
      marks: [
        { d: 'M12 42 L30 24 L38 42 Z', fill: '#cdeaf0' },
        { d: 'M50 24 L62 42 L38 42 Z', fill: '#e6f5f8' },
        { d: 'M62 42 L88 42 L50 86 Z', fill: '#7fb8c8' },
        { d: 'M12 42 L88 42', stroke: INK, w: 2 },
        { d: 'M30 24 L38 42 L50 24 L62 42 L70 24', stroke: INK, w: 2 },
        { d: 'M38 42 L50 86 L62 42', stroke: INK, w: 2 },
      ],
    },
    { d: glint(84, 18, 7), fill: GOLD, line: 2 },
    { d: glint(16, 22, 5), fill: GOLD, line: 2 },
  ],
  'easy-parking': [
    { d: R(46, 64, 8, 28, 1), fill: '#b9b2a2' },
    {
      d: R(20, 8, 60, 60, 9),
      fill: '#4f78a8',
      marks: [
        { d: R(25, 13, 50, 50, 6), stroke: PAPER, w: 2.4 },
        { d: 'M41 54 L41 24 L53 24 C66 24, 66 43, 53 43 L41 43', stroke: PAPER, w: 7.5 },
      ],
    },
  ],
  'transit-friendly': [
    { d: R(26, 78, 12, 12, 3), fill: INK, line: 0 },
    { d: R(62, 78, 12, 12, 3), fill: INK, line: 0 },
    {
      d: R(18, 12, 64, 70, 12),
      fill: AMBER,
      marks: [
        { d: R(18, 54, 64, 6), fill: '#c88a3c' },
        { d: R(32, 16, 36, 6, 2), fill: INK },
        { d: R(25, 26, 50, 26, 5), fill: '#cfe6f2', stroke: INK, w: 2.4 },
        { d: 'M31 48 L45 30', stroke: '#ffffff', w: 3, opacity: 0.8 },
        { d: C(31, 68, 5), fill: PAPER, stroke: INK, w: 2 },
        { d: C(69, 68, 5), fill: PAPER, stroke: INK, w: 2 },
        { d: 'M42 66 L58 66 M42 71 L58 71', stroke: INK, w: 2.2 },
      ],
    },
  ],
  'rainy-day': [
    { d: 'M50 14 L50 7', line: 3 },
    {
      d: 'M12 50 C12 28, 30 14, 50 14 C70 14, 88 28, 88 50 Q81.7 44 75.3 50 Q69 44 62.7 50 Q56.3 44 50 50 Q43.7 44 37.3 50 Q31 44 24.7 50 Q18.3 44 12 50 Z',
      fill: TERRA,
      marks: [
        { d: 'M50 14 Q38 28 37.3 50 Q43.7 44 50 50 Q56.3 44 62.7 50 Q62 28 50 14 Z', fill: GOLD },
        { d: 'M50 14 Q38 28 37.3 50', stroke: INK, w: 2 },
        { d: 'M50 14 Q62 28 62.7 50', stroke: INK, w: 2 },
      ],
    },
    { d: 'M50 50 L50 80 Q50 88 43 88 Q37 88 37 82', tube: { colour: BROWN, width: 4 }, line: 2.4 },
    { d: drop(18, 70), fill: SKY, line: 2 },
    { d: drop(80, 62), fill: SKY, line: 2 },
    { d: drop(70, 86), fill: SKY, line: 2 },
  ],
};

export function hasStickerArt(slug: string): boolean {
  return slug in ART;
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

// A turn and a shift applied to a path before it is measured: the path is
// moved by (dx, dy), then turned `angle` radians about (cx, cy).
type Placement = { dx: number; dy: number; angle: number; cx: number; cy: number };

// The bounds of an SVG path in its own units, curves and arcs included:
// exact extremes for the Béziers, and arcs sampled finely along their
// ellipse. Covers every path command, absolute and relative, which is more
// than the drawings above use.
//
// With a placement, the bounds of the path as placed. A turned Bézier is the
// Bézier of its turned control points, and a turned arc is the same arc with
// its own rotation added to, so turning each point as it is read keeps the
// result exact.
function pathBounds(d: string, placement?: Placement): Bounds {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+\.?)/g) ?? [];
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const cos = Math.cos(placement?.angle ?? 0);
  const sin = Math.sin(placement?.angle ?? 0);
  const turnDegrees = ((placement?.angle ?? 0) * 180) / Math.PI;
  // Where a point of the path ends up once placed.
  const T = (px: number, py: number): [number, number] => {
    if (!placement) return [px, py];
    const x0 = px + placement.dx - placement.cx;
    const y0 = py + placement.dy - placement.cy;
    return [x0 * cos - y0 * sin + placement.cx, x0 * sin + y0 * cos + placement.cy];
  };
  const add = (px: number, py: number) => {
    b.minX = Math.min(b.minX, px);
    b.minY = Math.min(b.minY, py);
    b.maxX = Math.max(b.maxX, px);
    b.maxY = Math.max(b.maxY, py);
  };
  // Where a quadratic or cubic Bézier turns back, per axis.
  const quad = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
    add(x2, y2);
    for (const [p0, p1, p2] of [
      [x0, x1, x2],
      [y0, y1, y2],
    ]) {
      const den = p0 - 2 * p1 + p2;
      if (den === 0) continue;
      const t = (p0 - p1) / den;
      if (t > 0 && t < 1) {
        const at = (a: number, c: number, e: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * e;
        add(at(x0, x1, x2), at(y0, y1, y2));
      }
    }
  };
  const cubic = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    add(x3, y3);
    const at = (t: number, a: number, c: number, e: number, f: number) =>
      (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * c + 3 * (1 - t) * t * t * e + t ** 3 * f;
    for (const [p0, p1, p2, p3] of [
      [x0, x1, x2, x3],
      [y0, y1, y2, y3],
    ]) {
      // The derivative, over three: a t² + b t + c.
      const a = -p0 + 3 * p1 - 3 * p2 + p3;
      const bb = 2 * (p0 - 2 * p1 + p2);
      const c = p1 - p0;
      const roots: number[] = [];
      if (Math.abs(a) < 1e-9) {
        if (bb !== 0) roots.push(-c / bb);
      } else {
        const disc = bb * bb - 4 * a * c;
        if (disc >= 0) roots.push((-bb + Math.sqrt(disc)) / (2 * a), (-bb - Math.sqrt(disc)) / (2 * a));
      }
      for (const t of roots) if (t > 0 && t < 1) add(at(t, x0, x1, x2, x3), at(t, y0, y1, y2, y3));
    }
  };
  // SVG's endpoint arc, converted to its centre form (SVG spec, F.6.5).
  const arc = (x1: number, y1: number, rxIn: number, ryIn: number, rot: number, large: number, sweep: number, x2: number, y2: number) => {
    add(x2, y2);
    let rx = Math.abs(rxIn);
    let ry = Math.abs(ryIn);
    if (rx === 0 || ry === 0) return;
    const phi = (rot * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const xp = cos * dx + sin * dy;
    const yp = -sin * dx + cos * dy;
    const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
    if (lambda > 1) {
      rx *= Math.sqrt(lambda);
      ry *= Math.sqrt(lambda);
    }
    const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
    const den = rx * rx * yp * yp + ry * ry * xp * xp;
    const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, den === 0 ? 0 : num / den));
    const cxp = (coef * rx * yp) / ry;
    const cyp = (-coef * ry * xp) / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const ux = (xp - cxp) / rx;
    const uy = (yp - cyp) / ry;
    const theta = angle(1, 0, ux, uy);
    let delta = angle(ux, uy, (-xp - cxp) / rx, (-yp - cyp) / ry);
    if (!sweep && delta > 0) delta -= Math.PI * 2;
    if (sweep && delta < 0) delta += Math.PI * 2;
    const steps = 24;
    for (let s = 1; s < steps; s++) {
      const th = theta + (delta * s) / steps;
      add(cos * rx * Math.cos(th) - sin * ry * Math.sin(th) + cx, sin * rx * Math.cos(th) + cos * ry * Math.sin(th) + cy);
    }
  };

  let i = 0;
  let cmd = '';
  let prev = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // The last control point, reflected by a following S or T.
  let ctrlX = 0;
  let ctrlY = 0;
  const isCommand = (t: string) => /[A-Za-z]/.test(t);
  const next = () => parseFloat(tokens[i++]);

  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      cmd = tokens[i++];
      if (cmd === 'Z' || cmd === 'z') {
        x = startX;
        y = startY;
        prev = 'Z';
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    const upper = cmd.toUpperCase();
    // The path is read in its own units (x and y); everything measured goes
    // through T first.
    switch (upper) {
      case 'M': {
        x = ox + next();
        y = oy + next();
        startX = x;
        startY = y;
        add(...T(x, y));
        // Further pairs after a move are lines.
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': {
        x = ox + next();
        y = oy + next();
        add(...T(x, y));
        break;
      }
      case 'H': {
        x = ox + next();
        add(...T(x, y));
        break;
      }
      case 'V': {
        y = oy + next();
        add(...T(x, y));
        break;
      }
      case 'C': {
        const [x1, y1, x2, y2, x3, y3] = [ox + next(), oy + next(), ox + next(), oy + next(), ox + next(), oy + next()];
        cubic(...T(x, y), ...T(x1, y1), ...T(x2, y2), ...T(x3, y3));
        [ctrlX, ctrlY, x, y] = [x2, y2, x3, y3];
        break;
      }
      case 'S': {
        const reflect = prev === 'C' || prev === 'S';
        const [x1, y1] = reflect ? [2 * x - ctrlX, 2 * y - ctrlY] : [x, y];
        const [x2, y2, x3, y3] = [ox + next(), oy + next(), ox + next(), oy + next()];
        cubic(...T(x, y), ...T(x1, y1), ...T(x2, y2), ...T(x3, y3));
        [ctrlX, ctrlY, x, y] = [x2, y2, x3, y3];
        break;
      }
      case 'Q': {
        const [x1, y1, x2, y2] = [ox + next(), oy + next(), ox + next(), oy + next()];
        quad(...T(x, y), ...T(x1, y1), ...T(x2, y2));
        [ctrlX, ctrlY, x, y] = [x1, y1, x2, y2];
        break;
      }
      case 'T': {
        const reflect = prev === 'Q' || prev === 'T';
        const [x1, y1] = reflect ? [2 * x - ctrlX, 2 * y - ctrlY] : [x, y];
        const [x2, y2] = [ox + next(), oy + next()];
        quad(...T(x, y), ...T(x1, y1), ...T(x2, y2));
        [ctrlX, ctrlY, x, y] = [x1, y1, x2, y2];
        break;
      }
      case 'A': {
        const [rx, ry, rot, large, sweep] = [next(), next(), next(), next(), next()];
        const [x2, y2] = [ox + next(), oy + next()];
        arc(...T(x, y), rx, ry, rot + turnDegrees, large, sweep, ...T(x2, y2));
        x = x2;
        y = y2;
        break;
      }
      default:
        // Not a path this file writes. Stop rather than misread the rest.
        return b;
    }
    prev = upper;
  }
  return b;
}

const boundsCache = new Map<string, Bounds>();

function cachedPathBounds(d: string): Bounds {
  let bounds = boundsCache.get(d);
  if (bounds == null) {
    bounds = pathBounds(d);
    boundsCache.set(d, bounds);
  }
  return bounds;
}

// How far each stroke of a die-cut silhouette reaches outside its path, in
// grid units: half the stroke it is drawn with in stickerArtSvg. A round
// stroke reaches equally every way, which is what lets the bounds below add
// it after turning a path rather than before.
function silhouetteReach(part: Part, cutUnits: number): number {
  const line = part.line ?? 3;
  return part.tube ? part.tube.width / 2 + line + cutUnits : line / 2 + cutUnits;
}

function silhouetteBounds(parts: Part[], cutUnits: number, placement?: Placement): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const part of parts) {
    if (part.cut === false) continue;
    const reach = silhouetteReach(part, cutUnits);
    const p = placement ? pathBounds(part.d, placement) : cachedPathBounds(part.d);
    b.minX = Math.min(b.minX, p.minX - reach);
    b.minY = Math.min(b.minY, p.minY - reach);
    b.maxX = Math.max(b.maxX, p.maxX + reach);
    b.maxY = Math.max(b.maxY, p.maxY + reach);
  }
  return b;
}

const centringCache = new Map<string, { dx: number; dy: number }>();

// How far a drawing has to move, in grid units, for it to sit in the middle
// of its square. They were drawn wherever they fell on the grid: the pram sat
// 5 points right of and below its box's middle, the signpost 4 low.
//
// The middle is that of its solid shapes: what is filled in, or drawn as a
// thick tube. A bare line, such as a cord or a wisp of steam, is left out. The
// outline with every line in it put its middle too far toward a thin part
// sticking out: the disco ball's cord dragged the ball itself 5 points low.
// The card lines its stickers up by this middle too, and spaces them by
// their whole outline (see stickerArtBounds).
function centring(slug: string, parts: Part[]): { dx: number; dy: number } {
  let shift = centringCache.get(slug);
  if (shift == null) {
    const solid = parts.filter((part) => part.fill != null || part.tube != null);
    const b = silhouetteBounds(solid.length > 0 ? solid : parts, 0);
    shift = { dx: 50 - (b.minX + b.maxX) / 2, dy: 50 - (b.minY + b.maxY) / 2 };
    centringCache.set(slug, shift);
  }
  return shift;
}

// The drawing's die-cut outline in box pixels, measured from the box's
// top-left: the part of the square that is actually sticker. Each drawing
// has its own shape (the sneaker is wide and short, the cup tall and narrow),
// so the card back spaces stickers by this rather than by the square. The
// box's middle is the drawing's weighted middle (see centring), so the
// outline need not be centred on it: the disco ball's reaches further up, to
// the end of its cord, than down.
//
// `tilt` is the sticker's lean in degrees, turned about the box's middle as
// TagStickerGraphic turns it: the bounds are of the drawing as it actually
// leans, so a leaning sticker is spaced by what it covers. The shadow is left
// out: at its opacity it hardly shows. Null for a tag without a drawing.
export function stickerArtBounds(
  slug: string,
  box: number,
  cut: number,
  tilt: number = 0,
): { x: number; y: number; width: number; height: number } | null {
  const parts = ART[slug];
  if (!parts) return null;
  const unit = box / (100 + PAD * 2);
  const { dx, dy } = centring(slug, parts);
  const b = silhouetteBounds(parts, cut / unit, { dx, dy, angle: (tilt * Math.PI) / 180, cx: 50, cy: 50 });
  return {
    x: (b.minX + PAD) * unit,
    y: (b.minY + PAD) * unit,
    width: (b.maxX - b.minX) * unit,
    height: (b.maxY - b.minY) * unit,
  };
}

// How far each colour lands from its outline, in grid units: under a pixel
// at the sizes these are shown, enough to read as printed, not as broken.
const REGISTER = 1.1;
// Room round the grid for the die-cut margin and the shadow.
const PAD = 11;

// The sticker as an SVG, box pixels square, with a die-cut margin of `cut`
// pixels round the drawing. Null for a tag without a drawing.
export function stickerArtSvg(slug: string, box: number, cut: number, seed: number): string | null {
  const parts = ART[slug];
  if (!parts) return null;
  const span = 100 + PAD * 2;
  const unit = box / span;
  const cutUnits = cut / unit;
  // Which way the colour slipped on this copy.
  const angle = (seed % 360) * (Math.PI / 180);
  const rx = (Math.cos(angle) * REGISTER).toFixed(2);
  const ry = (Math.sin(angle) * REGISTER).toFixed(2);

  const silhouette = (colour: string) =>
    parts
      .filter((p) => p.cut !== false)
      .map((p) => {
        const line = p.line ?? 3;
        if (p.tube) return `<path d="${p.d}" fill="none" stroke="${colour}" stroke-width="${(p.tube.width + line * 2 + cutUnits * 2).toFixed(1)}"/>`;
        if (!p.fill) return `<path d="${p.d}" fill="none" stroke="${colour}" stroke-width="${(line + cutUnits * 2).toFixed(1)}"/>`;
        return `<path d="${p.d}" fill="${colour}" stroke="${colour}" stroke-width="${(line + cutUnits * 2).toFixed(1)}"/>`;
      })
      .join('');

  const art = parts
    .map((p) => {
      const line = p.line ?? 3;
      if (p.tube) {
        return (
          `<path d="${p.d}" fill="none" stroke="${INK}" stroke-width="${p.tube.width + line * 2}"/>` +
          `<path d="${p.d}" fill="none" stroke="${p.tube.colour}" stroke-width="${p.tube.width}"/>`
        );
      }
      let out = '';
      if (p.fill) {
        const marks = (p.marks ?? [])
          .map(
            (m) =>
              `<path d="${m.d}" fill="${m.fill ?? 'none'}"` +
              (m.stroke ? ` stroke="${m.stroke}" stroke-width="${m.w ?? 2}"` : '') +
              (m.opacity != null ? ` opacity="${m.opacity}"` : '') +
              '/>',
          )
          .join('');
        out += `<g transform="translate(${rx} ${ry})"><path d="${p.d}" fill="${p.fill}"/>${marks}</g>`;
      }
      if (line > 0) out += `<path d="${p.d}" fill="none" stroke="${INK}" stroke-width="${line}"/>`;
      return out;
    })
    .join('');

  // Moved so the outline sits in the middle of the square (see centring).
  const { dx, dy } = centring(slug, parts);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="${-PAD} ${-PAD} ${span} ${span}">` +
    `<g stroke-linejoin="round" stroke-linecap="round" transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)})">` +
    `<g transform="translate(1.8 2.6)" opacity="0.3">${silhouette('#000000')}</g>` +
    silhouette(CREAM) +
    art +
    `</g></svg>`
  );
}
