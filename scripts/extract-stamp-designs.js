// Turns assets/brand-source/stamps/*.svg into src/lib/stamp-designs.ts.
//
// Run after adding or re-exporting a design:
//
//   node scripts/extract-stamp-designs.js
//
// It exists because the bundler hands back an asset reference rather than
// path data, so the geometry has to be inlined into a .ts file — the same
// reason stamp-shape.ts and sticker-shapes.ts inline theirs. Those two were
// done by hand and their comments promise an extractor that never existed;
// this is it, for the designs at least.
//
// What it relies on in the source files, all verified against the current
// exports:
//
//   * Two <g> groups per file. The FIRST in document order is layer 1 (the
//     mass) and the second is layer 2 (the detail drawn on top of it).
//   * Document order, never the group's name. SVG paints later elements on
//     top, so the group drawn first is the base and the one after it is the
//     detail sitting on it. The names do not track this: moon calls its
//     base Layer_2 and its detail Layer_1, and splitting on the name
//     rendered it as a solid blob, the one detail shape covering all nine
//     pieces of the mass beneath.
//   * No transforms anywhere, so geometry is taken verbatim.
//
// Illustrator gives every shape the same .cls-1 fill, which is why the
// grouping matters: there is no colour difference to split on. Fills and
// strokes in the source are ignored entirely — the app recolours both
// layers from the rating (layerColorsForRating), so the source colours are
// only there to make the file visible while drawing.

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'brand-source', 'stamps');
const OUT_FILE = path.join(__dirname, '..', 'src', 'lib', 'stamp-designs.ts');

// Illustrator emits polygons as often as paths, and the renderer only draws
// <path d="...">, so a polygon has to become equivalent path data or it
// silently disappears. points="x y x y ..." is whitespace- or
// comma-separated pairs; closed by definition, hence the trailing Z.
function polygonToPathData(points) {
  const nums = points.trim().split(/[\s,]+/).map(Number);
  if (nums.length < 6 || nums.length % 2 !== 0 || nums.some(Number.isNaN)) {
    throw new Error(`unparseable polygon points: ${points.slice(0, 60)}...`);
  }
  const pairs = [];
  for (let i = 0; i < nums.length; i += 2) pairs.push(`${nums[i]},${nums[i + 1]}`);
  return `M${pairs.join('L')}Z`;
}

// Shapes in document order within one group. Order matters: overlapping
// pieces of the same layer must stack the way they were drawn.
function shapesIn(groupBody, file) {
  const out = [];
  const re = /<(path|polygon)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(groupBody)) !== null) {
    const [, tag, attrs] = m;
    if (tag === 'path') {
      const d = /\bd="([^"]+)"/.exec(attrs);
      if (!d) throw new Error(`${file}: <path> with no d attribute`);
      out.push(d[1]);
    } else {
      const pts = /\bpoints="([^"]+)"/.exec(attrs);
      if (!pts) throw new Error(`${file}: <polygon> with no points attribute`);
      out.push(polygonToPathData(pts[1]));
    }
  }
  return out;
}

// Anything the renderer cannot draw must fail loudly here rather than show
// up later as a blank stamp nobody can explain.
function assertNoUnsupportedShapes(svg, file) {
  const unsupported = svg.match(/<(circle|rect|ellipse|line|polyline|text|image|use)\b/g);
  if (unsupported) {
    throw new Error(
      `${file}: contains ${[...new Set(unsupported)].join(', ')} — the renderer only draws ` +
        `<path> and <polygon>. Convert these to paths on export.`
    );
  }
  if (/\btransform=/.test(svg)) {
    throw new Error(`${file}: has a transform, which this extractor does not apply.`);
  }
}

function parseDesign(file) {
  const svg = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
  assertNoUnsupportedShapes(svg, file);

  const viewBox = /viewBox="([^"]+)"/.exec(svg);
  if (!viewBox) throw new Error(`${file}: no viewBox`);
  const [, , width, height] = viewBox[1].trim().split(/[\s,]+/).map(Number);
  if (!width || !height) throw new Error(`${file}: unusable viewBox "${viewBox[1]}"`);

  // Kept as a list, in document order — the order IS the layer assignment.
  const groups = [];
  const re = /<g\b([^>]*)>([\s\S]*?)<\/g>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const id = /\bid="([^"]+)"/.exec(m[1]);
    groups.push({ name: id ? id[1] : '(unnamed)', body: m[2] });
  }

  if (groups.length !== 2) {
    throw new Error(
      `${file}: expected 2 groups, found ${groups.length} (${groups.map((g) => g.name).join(', ')})`
    );
  }

  const layer1 = shapesIn(groups[0].body, file);
  const layer2 = shapesIn(groups[1].body, file);
  if (layer1.length === 0 || layer2.length === 0) {
    throw new Error(
      `${file}: a layer came out empty (layer1 ${layer1.length}, layer2 ${layer2.length})`
    );
  }

  // sightseer-stamp-eiffel.svg -> eiffel
  const id = file.replace(/^sightseer-stamp-/, '').replace(/\.svg$/, '');
  return { id, width, height, layer1, layer2, name1: groups[0].name, name2: groups[1].name };
}

const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.svg')).sort();
const designs = files.map(parseDesign);

for (const d of designs) {
  console.log(
    `${d.id.padEnd(10)} ${String(d.width).padStart(8)}x${String(d.height).padEnd(8)} ` +
      `layer1 ${d.layer1.length} from ${d.name1}, layer2 ${d.layer2.length} from ${d.name2}`
  );
}

const entries = designs
  .map(
    (d) => `  {
    id: '${d.id}',
    width: ${d.width},
    height: ${d.height},
    layer1: [
${d.layer1.map((p) => `      '${p}',`).join('\n')}
    ],
    layer2: [
${d.layer2.map((p) => `      '${p}',`).join('\n')}
    ],
  },`
  )
  .join('\n');

const idUnion = designs.map((d) => `'${d.id}'`).join(' | ');

const header = `
// The interchangeable artwork that fills a rating stamp's window.
//
// Each design is drawn in two layers over the rating-coloured background.
// Both take a colour DARKER than that background, derived from it rather
// than fixed (layerColorsForRating in rating-gradient.ts): layer 1 is the
// mass, layer 2 is darker still and more saturated, and is the detail drawn
// on top of it. That is what lets one design read correctly at every rating
// instead of only against the middle of the gradient.
//
// Order matters — layer 2 paints over layer 1, not under it.
// Every design in the folder, as a union. stamp-matching.ts keys its rules
// on this, so naming a design that no longer exists is a compile error
// rather than a rule that silently never fires.
export type StampDesignId = ${idUnion};

export type StampDesign = {
  // A stable identifier, used to seed variation, to attach matching rules
  // in stamp-matching.ts, and to make a regression obvious if the list is
  // ever reordered.
  id: StampDesignId;
  // Each design keeps its OWN viewBox — they are drawn on separate canvases
  // and nothing here assumes a shared coordinate space. buildStampSvg
  // scales and centres each design into the stamp's window.
  width: number;
  height: number;
  layer1: string[];
  layer2: string[];
};

// GENERATED by scripts/extract-stamp-designs.js from
// assets/brand-source/stamps/*.svg — do not hand-edit. Re-run the script
// after adding or re-exporting a design.
//
// Inlined rather than imported from those .svg files because the bundler
// hands back an asset reference, not path data, which is the same reason
// stamp-shape.ts and sticker-shapes.ts inline theirs.
export const STAMP_DESIGNS: StampDesign[] = [
${entries}
];
`;

fs.writeFileSync(OUT_FILE, header);
console.log(`\nwrote ${path.relative(process.cwd(), OUT_FILE)} (${designs.length} designs)`);
