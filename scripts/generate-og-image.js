// Regenerates public/sightseer-og.png — the image every link preview shows.
//
// Run after changing the logo:
//   npm install --no-save sharp
//   node scripts/generate-og-image.js
//
// Two things here are deliberate and were both bugs in the image this
// replaced (public/sightseer-logo.png, 960x549):
//
// 1. The background is OPAQUE. That file is a cream mark on transparency,
//    and a messaging client compositing it onto its own white card renders
//    cream-on-white — a preview that looks broken rather than branded.
//    Nothing in the OG spec promises a background, so the image has to
//    carry its own.
//
// 2. It is 1200x630. That is what `twitter:card: summary_large_image` and
//    every OG consumer scales from; below ~600px wide some clients drop to
//    the small square card instead, which is the layout this was trying not
//    to get.
//
// The mark is composited from the existing cream PNG rather than re-filled
// from logo.svg: the SVG's mark is sage (#9bb88d) on near-black, and the
// cream is the colour the brand actually uses on a dark field.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const BACKGROUND = '#031009'; // BrandColors.background
const WIDTH = 1200;
const HEIGHT = 630;
// Generous margin. A preview card is small and is often cropped toward the
// centre by the client, so the mark is kept well inside the safe area
// rather than filling the frame.
const MARK_WIDTH = Math.round(WIDTH * 0.62);

const markSrc = path.join(ROOT, 'public', 'sightseer-logo.png');
const outFile = path.join(ROOT, 'public', 'sightseer-og.png');

(async () => {
  const mark = await sharp(markSrc)
    .resize({ width: MARK_WIDTH, fit: 'inside', withoutEnlargement: false })
    .toBuffer();
  const { width: mw, height: mh } = await sharp(mark).metadata();

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([
      {
        input: mark,
        left: Math.round((WIDTH - mw) / 2),
        top: Math.round((HEIGHT - mh) / 2),
      },
    ])
    .png()
    .toFile(outFile);

  const out = fs.readFileSync(outFile);
  console.log(
    `wrote ${path.relative(ROOT, outFile)} ` +
      `${out.readUInt32BE(16)}x${out.readUInt32BE(20)} (${(out.length / 1024).toFixed(1)} KB)`
  );
})();
