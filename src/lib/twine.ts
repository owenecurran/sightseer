import { svgDataUri } from '@/lib/base64';

// A length of twine, drawn as an SVG: what Discover's luggage tags hang by.
// It replaced a flat line of one colour at one opacity, which was the one
// thing that gave the tags away as drawn.
//
// An image rather than a Skia canvas, for the reason the rating stamps are:
// one live canvas per tag is the GPU load that faulted the driver. Base64,
// not percent-encoded, because Android's Glide decodes only base64 SVGs.

type TwinePalette = {
  // The two plies, twisted round each other. The same colour twice for a
  // plain twine; two for baker's twine.
  plyA: string;
  plyB: string;
  // The shadow in each groove of the twist, and the light along each ply.
  groove: string;
  shine: string;
};

const PALETTES: TwinePalette[] = [
  // Jute.
  { plyA: '#a8875a', plyB: '#957650', groove: '#5e4729', shine: '#d6bb8c' },
  // Natural, undyed.
  { plyA: '#d8cba8', plyB: '#cbbd98', groove: '#8f7f5c', shine: '#f3ebd2' },
  // Baker's twine, its red faded.
  { plyA: '#b5493f', plyB: '#e9e0cc', groove: '#6b2c25', shine: '#f6efe0' },
  // Grey-green cotton.
  { plyA: '#8f9a86', plyB: '#7f8a77', groove: '#4f594b', shine: '#bec7b4' },
];

export type Twine = {
  palette: TwinePalette;
  // Where along the twist it starts, so no two lengths line up.
  phase: number;
  // Stray fibres: how far down the length (a share), which side, and how
  // long, in points.
  fibres: { at: number; side: -1 | 1; length: number }[];
  // Which way the knot's two loose ends fall.
  tailTurn: number;
};

// Plies this thick, twisting once every this many points.
const THICKNESS = 3.4;
const PITCH = 4.4;
// The image is wider than the twine, for its fibres to stick out into.
export const TWINE_WIDTH = 14;

export function twineFor(random: () => number): Twine {
  const fibres: Twine['fibres'] = [];
  const count = 1 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    fibres.push({ at: 0.15 + random() * 0.7, side: random() < 0.5 ? -1 : 1, length: 2 + random() * 3 });
  }
  return {
    palette: PALETTES[Math.floor(random() * PALETTES.length)],
    phase: random() * PITCH,
    fibres,
    tailTurn: random() < 0.5 ? -1 : 1,
  };
}

// The twine itself, from y0 to y1, centred at cx: one ply laid along it, the
// other wound round it in slanted bands, a groove shaded at each turn and a
// glint of light along each band.
function ply(twine: Twine, id: string, cx: number, y0: number, y1: number): string {
  const { palette, phase } = twine;
  const half = THICKNESS / 2;
  let bands = '';
  for (let y = y0 - PITCH + phase; y < y1 + PITCH; y += PITCH) {
    bands +=
      `<line x1="${cx - half - 1}" y1="${y.toFixed(2)}" x2="${cx + half + 1}" y2="${(y + PITCH * 0.85).toFixed(2)}" ` +
      `stroke="${palette.plyA}" stroke-width="${(PITCH * 0.48).toFixed(2)}"/>` +
      `<line x1="${cx - half}" y1="${(y + PITCH * 0.42).toFixed(2)}" x2="${cx + half}" y2="${(y + PITCH * 1.12).toFixed(2)}" ` +
      `stroke="${palette.groove}" stroke-width="0.7" stroke-opacity="0.6"/>` +
      `<line x1="${cx - half + 0.6}" y1="${(y + PITCH * 0.05).toFixed(2)}" x2="${cx + 0.4}" y2="${(y + PITCH * 0.5).toFixed(2)}" ` +
      `stroke="${palette.shine}" stroke-width="0.6" stroke-opacity="0.7"/>`;
  }
  return (
    `<clipPath id="${id}"><rect x="${cx - half}" y="${y0}" width="${THICKNESS}" height="${y1 - y0}" rx="${half}"/></clipPath>` +
    `<rect x="${cx - half}" y="${y0}" width="${THICKNESS}" height="${y1 - y0}" rx="${half}" fill="${palette.plyB}"/>` +
    `<g clip-path="url(#${id})">${bands}</g>`
  );
}

// A length hanging from a pin: `height` points of it, with its stray fibres.
export function twineUri(twine: Twine, height: number): string {
  const cx = TWINE_WIDTH / 2;
  const fibres = twine.fibres
    .map(({ at, side, length }) => {
      const x = cx + side * (THICKNESS / 2 - 0.3);
      const y = at * height;
      return (
        `<path d="M${x.toFixed(2)} ${y.toFixed(2)} q${(side * length * 0.6).toFixed(2)} ${(-length * 0.2).toFixed(2)} ` +
        `${(side * length).toFixed(2)} ${(length * 0.5).toFixed(2)}" fill="none" stroke="${twine.palette.shine}" ` +
        `stroke-width="0.5" stroke-opacity="0.8"/>`
      );
    })
    .join('');
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TWINE_WIDTH}" height="${height}" viewBox="0 0 ${TWINE_WIDTH} ${height}">` +
      ply(twine, 'twine', cx, 0, height) +
      fibres +
      `</svg>`,
  );
}

// Where the twine meets the tag: it comes over the tag's top edge, is knotted
// there, and goes down into the hole, with the knot's two cut ends falling
// to one side, frayed. Drawn over the tag; `edge` and `hole` are how far down
// the image the tag's top edge and the top of its hole are.
export const KNOT_WIDTH = 28;

export function knotUri(twine: Twine, edge: number, hole: number): string {
  const cx = KNOT_WIDTH / 2;
  const { palette, tailTurn: turn } = twine;
  const knotY = edge - 1;
  const height = hole + 3;
  const tail = (dx: number, dy: number) => {
    const x2 = cx + turn * dx;
    const y2 = knotY + dy;
    return (
      `<line x1="${cx}" y1="${knotY}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${palette.plyA}" ` +
      `stroke-width="1.7" stroke-linecap="round"/>` +
      `<line x1="${cx}" y1="${knotY}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${palette.groove}" ` +
      `stroke-width="0.5" stroke-opacity="0.5" stroke-dasharray="1.4 1.6"/>` +
      // Frayed: the end splits into a few hairs.
      `<path d="M${x2.toFixed(2)} ${y2.toFixed(2)} l${(turn * 1.6).toFixed(2)} 1.8 M${x2.toFixed(2)} ${y2.toFixed(2)} ` +
      `l${(turn * 0.2).toFixed(2)} 2.3 M${x2.toFixed(2)} ${y2.toFixed(2)} l${(turn * 2.2).toFixed(2)} 0.6" ` +
      `stroke="${palette.shine}" stroke-width="0.5" stroke-opacity="0.85"/>`
    );
  };
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${KNOT_WIDTH}" height="${height}" viewBox="0 0 ${KNOT_WIDTH} ${height}">` +
      // Into the hole, stopping just inside its rim.
      ply(twine, 'into', cx, 0, height) +
      tail(5.5, 9) +
      tail(8.5, 6) +
      // The knot: two turns of the twine bunched on the tag's edge.
      `<ellipse cx="${cx - 0.6}" cy="${knotY}" rx="3.4" ry="2.6" fill="${palette.plyA}" transform="rotate(-28 ${cx} ${knotY})"/>` +
      `<ellipse cx="${cx + 0.6}" cy="${knotY + 0.4}" rx="3.2" ry="2.4" fill="${palette.plyB}" transform="rotate(32 ${cx} ${knotY})"/>` +
      `<path d="M${cx - 2.6} ${knotY - 0.8} q2.6 2.2 5.2 0" fill="none" stroke="${palette.groove}" stroke-width="0.7" stroke-opacity="0.7"/>` +
      `<path d="M${cx - 1.8} ${knotY - 1.9} q1.4 -0.6 2.6 0.2" fill="none" stroke="${palette.shine}" stroke-width="0.6" stroke-opacity="0.8"/>` +
      `</svg>`,
  );
}

// Twine laid along a polyline (`points`, as SVG writes them): one ply along
// it, the other in short bands round it, a shadow in each turn, and a glint
// offset by `glint` toward the light.
function twineAlong(twine: Twine, points: string, glint: [number, number] = [0, -0.9]): string {
  const { palette } = twine;
  const stroke = (color: string, strokeWidth: number, extra = '') =>
    `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  return (
    stroke(palette.plyB, 3.2) +
    stroke(palette.plyA, 3.2, `stroke-dasharray="2.4 2.2" stroke-dashoffset="${twine.phase.toFixed(2)}"`) +
    stroke(palette.groove, 0.7, 'stroke-opacity="0.55" stroke-dasharray="0.7 3.9"') +
    `<g transform="translate(${glint[0]} ${glint[1]})">` +
    stroke(palette.shine, 0.6, 'stroke-opacity="0.65" stroke-dasharray="1.5 3.1"') +
    `</g>`
  );
}

// The rail the tags hang from: one length of twine strung across the strip
// between two nails, dipping between each pair of tags and knotted at each
// tag's string. `anchors` are the knots' x positions, all at `y`; `sags` is
// how far it dips in each span, from the left end to the right; `ends` are
// the two nails' x positions, which railEndUri draws.
//
// It used to run on past both ends of the strip, off the edge of the
// screen, which made the end of the strip look exactly like the middle: a
// length of twine that runs off the screen could carry more tags. One tied
// to a nail, with bare wall after it, cannot.
export function railUri(
  twine: Twine,
  width: number,
  height: number,
  y: number,
  anchors: number[],
  sags: number[],
  ends: [number, number],
): string {
  const { palette } = twine;
  const ties = [ends[0], ...anchors, ends[1]];
  const points: string[] = [];
  for (let span = 0; span < ties.length - 1; span++) {
    const x0 = ties[span];
    const x1 = ties[span + 1];
    const sag = sags[span] ?? sags[sags.length - 1];
    const steps = Math.max(4, Math.round((x1 - x0) / 8));
    for (let step = span === 0 ? 0 : 1; step <= steps; step++) {
      const t = step / steps;
      points.push(`${(x0 + (x1 - x0) * t).toFixed(1)},${(y + sag * Math.sin(Math.PI * t)).toFixed(1)}`);
    }
  }
  const knots = anchors
    .map(
      (x) =>
        `<ellipse cx="${x - 0.5}" cy="${y + 0.5}" rx="3.2" ry="2.6" fill="${palette.plyA}" transform="rotate(-24 ${x} ${y})"/>` +
        `<ellipse cx="${x + 0.6}" cy="${y + 0.8}" rx="3" ry="2.3" fill="${palette.plyB}" transform="rotate(30 ${x} ${y})"/>` +
        `<path d="M${x - 2.4} ${y} q2.4 2 4.8 0" fill="none" stroke="${palette.groove}" stroke-width="0.7" stroke-opacity="0.7"/>`,
    )
    .join('');
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      twineAlong(twine, points.join(' ')) +
      knots +
      `</svg>`,
  );
}

// How wide one tied-off end's image is. Its nail is in the middle, `y` down.
export const RAIL_END_WIDTH = 36;

// How tall a tied-off end's image is, for a nail `y` down and a loose end
// `tail` long.
export function railEndHeight(y: number, tail: number): number {
  return Math.ceil(y + tail + 6);
}

// One end of the rail: the twine wound twice round a nail in the wall and
// tied off, its cut end hanging down and away from the tags, frayed. `side`
// is -1 for the left end and 1 for the right. Drawn on its own, small, so
// that it does not stretch when the rail gives (see PlaceTagRail): a nail
// does not move, and the end hanging off it does not stretch.
export function railEndUri(twine: Twine, side: -1 | 1, y: number, tail: number): string {
  const { palette } = twine;
  const cx = RAIL_END_WIDTH / 2;
  const height = railEndHeight(y, tail);

  // The loose end: out from under the nail's head on the side away from the
  // tags, falling in a slight curve and swinging back in a little at the
  // bottom, the way a short end of twine hangs.
  const start = { x: cx + side * 1.6, y: y + 2.2 };
  const bend = { x: cx + side * 7, y: y + tail * 0.42 };
  const end = { x: cx + side * 4.6, y: y + tail };
  const points: string[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * bend.x + t * t * end.x;
    const py = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * bend.y + t * t * end.y;
    points.push(`${x.toFixed(2)},${py.toFixed(2)}`);
  }
  // Cut and frayed: the end splits into a few loose hairs.
  const hair = (dx: number, dy: number, color: string) =>
    `<path d="M${end.x.toFixed(2)} ${end.y.toFixed(2)} l${(side * dx).toFixed(2)} ${dy.toFixed(2)}" ` +
    `stroke="${color}" stroke-width="0.6" stroke-linecap="round" stroke-opacity="0.9"/>`;
  const fray =
    hair(1.6, 2.6, palette.shine) + hair(-0.8, 3, palette.plyA) + hair(2.8, 1.4, palette.shine) + hair(0.4, 3.4, palette.plyB);

  // Two turns round the nail's shank, bunched under its head.
  const wraps =
    `<ellipse cx="${cx}" cy="${(y + 0.9).toFixed(2)}" rx="4.8" ry="2.6" fill="${palette.plyB}" ` +
    `transform="rotate(${-12 * side} ${cx} ${y})"/>` +
    `<ellipse cx="${(cx + side * 0.5).toFixed(2)}" cy="${(y + 2).toFixed(2)}" rx="4.3" ry="2.3" fill="${palette.plyA}" ` +
    `transform="rotate(${10 * side} ${cx} ${y})"/>` +
    `<path d="M${cx - 3.8} ${(y + 1.4).toFixed(2)} q3.8 2.3 7.6 0" fill="none" stroke="${palette.groove}" ` +
    `stroke-width="0.7" stroke-opacity="0.7"/>`;

  // The nail's head, domed and worn, lit from the top left, with its
  // shadow on the wall.
  const nail =
    `<ellipse cx="${cx + 1.3}" cy="${(y + 1.9).toFixed(2)}" rx="4.2" ry="3.8" fill="#000000" fill-opacity="0.45"/>` +
    `<circle cx="${cx}" cy="${y}" r="4" fill="url(#nail-head)" stroke="#3d3a33" stroke-width="0.8"/>` +
    `<ellipse cx="${cx - 1.3}" cy="${(y - 1.4).toFixed(2)}" rx="1.4" ry="0.8" fill="#f6f2e4" fill-opacity="0.8" ` +
    `transform="rotate(-30 ${cx - 1.3} ${y - 1.4})"/>`;

  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${RAIL_END_WIDTH}" height="${height}" viewBox="0 0 ${RAIL_END_WIDTH} ${height}">` +
      `<defs><radialGradient id="nail-head" cx="0.38" cy="0.32" r="0.78">` +
      `<stop offset="0" stop-color="#ddd8c8"/><stop offset="0.55" stop-color="#9d988c"/><stop offset="1" stop-color="#57534a"/>` +
      `</radialGradient></defs>` +
      twineAlong(twine, points.join(' '), [-0.9, 0]) +
      fray +
      wraps +
      nail +
      `</svg>`,
  );
}
