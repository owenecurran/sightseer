// Regenerates every app-icon/favicon/loading-icon PNG (and favicon.ico) in
// assets/images/ from the source SVGs in assets/brand-source/. Run this
// again whenever logo.svg or loading-icon.svg change.
//
// `sharp` and `to-ico` aren't project dependencies (this is the only thing
// that needs them) — install them first:
//   npm install --no-save sharp to-ico
// then:
//   node scripts/generate-brand-assets.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'brand-source');
const OUT = path.join(ROOT, 'assets', 'images');

const logoSvg = fs.readFileSync(path.join(SRC, 'logo.svg'), 'utf8');
const loadingSvg = fs.readFileSync(path.join(SRC, 'loading-icon.svg'), 'utf8');

// logo.svg is a flat rect (background) + single path (mark). Pull just the
// path data out so the Android adaptive-icon foreground/monochrome layers
// can render the mark alone, transparent background, independently sized.
const markPathMatch = logoSvg.match(/<path[^>]*\sd="([^"]+)"[^>]*\/>/);
if (!markPathMatch) throw new Error('Could not find mark path in logo.svg');
const markPathD = markPathMatch[1];
const MARK_VIEWBOX = '0 0 2000 2000';
const SAGE = '#9bb88d';

function markOnlySvg(fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}"><path d="${markPathD}" fill="${fill}"/></svg>`;
}

async function main() {
  // Full composed square (dark bg + sage mark baked in) — app icon + splash.
  await sharp(Buffer.from(logoSvg)).resize(1024, 1024).png().toFile(path.join(OUT, 'icon.png'));
  await sharp(Buffer.from(logoSvg)).resize(512, 512).png().toFile(path.join(OUT, 'splash-icon.png'));

  // Web favicon: multi-size .ico (16/32/48), plus a plain PNG kept around
  // for anything that wants to reference it directly.
  const icoSizes = [16, 32, 48];
  const icoBuffers = await Promise.all(
    icoSizes.map((size) => sharp(Buffer.from(logoSvg)).resize(size, size).png().toBuffer())
  );
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), await toIco(icoBuffers));
  await sharp(Buffer.from(logoSvg)).resize(192, 192).png().toFile(path.join(OUT, 'favicon.png'));

  // Android adaptive icon: mark only, transparent bg, sized to ~60% of the
  // canvas so it stays inside the OS's safe zone regardless of mask shape
  // (circle/squircle/rounded-square) — background is a flat color in
  // app.json (android.adaptiveIcon.backgroundColor) instead of a separate
  // image.
  const CANVAS = 1024;
  const MARK_SIZE = Math.round(CANVAS * 0.6);

  async function markLayer(fill) {
    const markBuf = await sharp(Buffer.from(markOnlySvg(fill)))
      .resize(MARK_SIZE, MARK_SIZE, { fit: 'contain' })
      .png()
      .toBuffer();
    return sharp({
      create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: markBuf, gravity: 'center' }])
      .png()
      .toBuffer();
  }

  fs.writeFileSync(path.join(OUT, 'android-icon-foreground.png'), await markLayer(SAGE));
  fs.writeFileSync(path.join(OUT, 'android-icon-monochrome.png'), await markLayer('#ffffff'));

  // Loading icon: mark only, transparent bg, modest inline-UI size.
  await sharp(Buffer.from(loadingSvg)).resize(400).png().toFile(path.join(OUT, 'loading-icon.png'));

  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
