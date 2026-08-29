import { Skia, type SkPath, type SkRect } from '@shopify/react-native-skia';

// Path data from assets/brand-source/stamp outline.svg — a real design
// asset (a perforated postage-stamp frame, viewBox 1100x1400, with a plain
// rectangular window cut out of its middle via the second subpath below,
// wound oppositely so Skia's default nonzero fill rule renders it as a
// hole), not hand-approximated notch geometry.
//
// Lightly normalized from the raw exported `d` attribute: the original has
// ~32 spots where two numbers are glued with no separator (e.g. "1.3.99",
// meaning "1.3" then ".99" — valid per the SVG path grammar, since a second
// "." unambiguously starts a new number). Explicit commas inserted at every
// such boundary — not because it was confirmed to matter (a "Cannot read
// properties of undefined (reading 'Path')" failure that looked
// content-related turned out, after isolating it down to even a trivial
// hardcoded path string failing the same way, to be unrelated: accumulated
// dev-server/Fast-Refresh staleness in that session, fixed by a full Metro
// restart, not by this normalization) — but harmless, more explicit, and
// one fewer thing to question if a *real* parser incompatibility ever
// surfaces here later.
export const STAMP_FRAME_OUTER_SVG =
  'M1100,53.03v-28.28c-.82,0-1.64-.04-2.46-.12-.8-.08-1.62-.2-2.42-.36-1.6-.32-3.18-.79-4.68-1.43-1.52-.61-2.96-1.39-4.32-2.28-.68-.44-1.34-.93-1.98-1.43-.62-.51-1.24-1.07-1.82-1.64-.58-.57-1.12-1.17-1.64-1.8-.52-.63-1.02-1.29-1.46-1.96-.9-1.35-1.68-2.77-2.3-4.28-.62-1.49-1.12-3.05-1.44-4.61-.16-.81-.28-1.6-.36-2.42-.08-.81-.12-1.62-.12-2.43h-28.58c0,13.66-11.18,24.75-25,24.75S996.42,13.66,996.42,0h-28.56c0,13.66-11.2,24.75-25,24.75S917.86,13.66,917.86,0h-28.58c0,13.66-11.18,24.75-25,24.75S839.28,13.66,839.28,0h-28.56c0,13.66-11.2,24.75-25,24.75S760.72,13.66,760.72,0h-28.58c0,13.66-11.2,24.75-25,24.75S682.14,13.66,682.14,0h-28.56c0,13.66-11.2,24.75-25,24.75S603.58,13.66,603.58,0h-28.58c0,13.66-11.2,24.75-25,24.75S525,13.66,525,0h-28.58c0,13.66-11.18,24.75-25,24.75S446.42,13.66,446.42,0h-28.56c0,13.66-11.2,24.75-25,24.75S367.86,13.66,367.86,0h-28.58c0,13.66-11.18,24.75-25,24.75S289.28,13.66,289.28,0h-28.56c0,13.66-11.2,24.75-25,24.75S210.72,13.66,210.72,0h-28.58c0,13.66-11.2,24.75-25,24.75S132.14,13.66,132.14,0h-28.56c0,13.66-11.2,24.75-25,24.75S53.58,13.66,53.58,0h-28.58c0,.81-.04,1.62-.12,2.43-.08,.81-.2,1.6-.38,2.4-.32,1.58-.8,3.15-1.42,4.63-.62,1.5-1.4,2.93-2.3,4.28-.44,.67-.94,1.33-1.46,1.96-.52,.63-1.06,1.23-1.64,1.8-.58,.57-1.2,1.13-1.82,1.64-.64,.5-1.3,.99-1.98,1.43-1.36,.89-2.8,1.66-4.32,2.28-1.5,.63-3.08,1.11-4.68,1.43-.8,.16-1.62,.28-2.42,.36-.82,.08-1.64,.12-2.46,.12v28.28c13.8,0,25,11.09,25,24.75S13.8,102.53,0,102.53v28.28c13.8,0,25,11.07,25,24.73s-11.2,24.77-25,24.77v28.26c13.8,0,25,11.09,25,24.75s-11.2,24.75-25,24.75v28.28c13.8,0,25,11.07,25,24.75s-11.2,24.75-25,24.75v28.26c13.8,0,25,11.09,25,24.75s-11.2,24.75-25,24.75v28.28c13.8,0,25,11.09,25,24.75s-11.2,24.75-25,24.75v28.28c13.8,0,25,11.07,25,24.75s-11.2,24.75-25,24.75v28.26c13.8,0,25,11.09,25,24.75s-11.2,24.75-25,24.75v28.28c13.8,0,25,11.09,25,24.75s-11.2,24.75-25,24.75v28.28c13.8,0,25,11.07,25,24.75s-11.2,24.75-25,24.75v28.26c13.8,0,25,11.09,25,24.75s-11.2,24.75-25,24.75v28.28c13.8,0,25,11.07,25,24.75s-11.2,24.75-25,24.75v28.26c13.8,0,25,11.09,25,24.77s-11.2,24.73-25,24.73v28.28c13.8,0,25,11.09,25,24.75s-11.2,24.75-25,24.75v28.28c13.8,0,25,11.07,25,24.75s-11.2,24.75-25,24.75v28.28c13.8,0,25,11.07,25,24.73s-11.2,24.77-25,24.77v28.26c13.8,0,25,11.09,25,24.75s-11.2,24.75-25,24.75v28.28c.82,0,1.64,.04,2.46,.12,.8,.08,1.62,.2,2.42,.36,1.6,.32,3.18,.79,4.68,1.43,1.5,.61,2.96,1.38,4.32,2.28,.68,.44,1.34,.93,1.96,1.43,.64,.52,1.26,1.07,1.84,1.64s1.12,1.17,1.64,1.8c.52,.63,1.02,1.29,1.46,1.96,.9,1.35,1.68,2.77,2.3,4.28,.62,1.49,1.1,3.05,1.44,4.63,.16,.79,.28,1.58,.36,2.4,.08,.81,.12,1.62,.12,2.43h28.58c0-13.68,11.18-24.75,25-24.75s24.98,11.07,24.98,24.75h28.58c0-13.68,11.2-24.75,25-24.75s25,11.07,25,24.75h28.58c0-13.68,11.18-24.75,25-24.75s25,11.07,25,24.75h28.56c0-13.68,11.2-24.75,25-24.75s25,11.07,25,24.75h28.58c0-13.68,11.18-24.75,25-24.75s25,11.07,25,24.75h28.56c0-13.68,11.2-24.75,25-24.75s25,11.07,25,24.75h28.58c0-13.68,11.2-24.75,25-24.75s25,11.07,25,24.75h28.58c0-13.68,11.18-24.75,24.98-24.75s25,11.07,25,24.75h28.58c0-13.68,11.2-24.75,25-24.75s25,11.07,25,24.75h28.58c0-13.68,11.18-24.75,25-24.75s25,11.07,25,24.75h28.56c0-13.68,11.2-24.75,25-24.75s25,11.07,25,24.75h28.58c0-13.68,11.18-24.75,25-24.75s25,11.07,25,24.75h28.56c0-13.68,11.2-24.75,25-24.75s25,11.07,25,24.75h28.58c0-.81,.04-1.62,.12-2.43,.08-.81,.2-1.6,.36-2.4,.32-1.58,.8-3.15,1.44-4.63,.62-1.5,1.4-2.93,2.3-4.28,.44-.67,.94-1.33,1.44-1.96,.52-.63,1.08-1.23,1.66-1.8s1.2-1.13,1.82-1.64c.64-.5,1.3-.99,1.98-1.43,1.36-.89,2.8-1.66,4.32-2.28,1.5-.63,3.08-1.11,4.68-1.43,.8-.16,1.62-.28,2.42-.36,.82-.08,1.64-.11,2.46-.1v-28.29c-13.8,0-25-11.09-25-24.75s11.2-24.75,25-24.75v-28.26c-13.8,0-25-11.09-25-24.77s11.2-24.73,25-24.73v-28.28c-13.8,0-25-11.09-25-24.75s11.2-24.75,25-24.75v-28.28c-13.8,0-25-11.07-25-24.75s11.2-24.75,25-24.75v-28.28c-13.8,0-25-11.07-25-24.73s11.2-24.77,25-24.77v-28.26c-13.8,0-25-11.09-25-24.75s11.2-24.75,25-24.75v-28.28c-13.8,0-25-11.07-25-24.75s11.2-24.75,25-24.75v-28.28c-13.8,0-25-11.07-25-24.73s11.2-24.77,25-24.77v-28.26c-13.8,0-25-11.09-25-24.75s11.2-24.75,25-24.75v-28.28c-13.8,0-25-11.07-25-24.75s11.2-24.75,25-24.75v-28.26c-13.8,0-25-11.09-25-24.75s11.2-24.75,25-24.75v-28.28c-13.8,0-25-11.09-25-24.75s11.2-24.75,25-24.75v-28.28c-13.8,0-25-11.07-25-24.73s11.2-24.77,25-24.77v-28.26c-13.8,0-25-11.09-25-24.75s11.2-24.75,25-24.75v-28.28c-13.8,0-25-11.09-25-24.75s11.2-24.75,25-24.75v-28.26c-13.8,0-25-11.09-25-24.77s11.2-24.73,25-24.73v-28.28c-13.8,0-25-11.09-25-24.75s11.2-24.75,25-24.75Z';

const STAMP_FRAME_WINDOW_SVG =
  'M1000,1272.73H100V127.27h900v1145.45Z';

export const STAMP_VIEWBOX_WIDTH = 1100;
export const STAMP_VIEWBOX_HEIGHT = 1400;

// The frame's inner window, as a plain rect — derived directly from the SVG
// path's own second subpath (an M/H/V/h/v/Z rectangle: absolute to
// (100,127.27)-(1000,127.27)-(1000,~1272.73), starting from (1000,1272.73)).
// Kept as a separate exported rect (not just implied by the frame path)
// since badge content — the color fill, grain, logo, and rating number —
// needs these exact bounds to size and center itself within the window,
// not the frame's own outer bounds.
export const STAMP_WINDOW_RECT: SkRect = { x: 100, y: 127.27, width: 900, height: 1145.46 };

// A plain rect standing in for the real frame path — used if parsing ever
// genuinely fails, as a permanent safety net (a crashed rating badge should
// never take the whole screen down with it — confirmed live it did, via the
// nearest error boundary, before this existed). Built via MakeFromSVGString
// like everything else here, deliberately not `Skia.Path.Make()` — that
// specific factory method turned out to be the real culprit behind a long,
// confusing debugging detour: `Skia.Path.Make()` threw "Cannot read
// properties of undefined (reading 'PathBuilder')" 100% consistently on
// this project's pinned canvaskit-wasm@0.41.0 (web), never once succeeding
// across 100 retries — not a readiness race at all, just an unsupported
// method on this CanvasKit build. `MakeFromSVGString` (used for the real
// frame path below, and already proven working all session via
// brand-mark.ts) doesn't touch PathBuilder and works fine. See
// rating-glass-badge.tsx's readiness-probe comment for the fuller story.
function fallbackFramePath(): SkPath {
  return Skia.Path.MakeFromSVGString(`M0,0H${STAMP_VIEWBOX_WIDTH}V${STAMP_VIEWBOX_HEIGHT}H0Z`)!;
}

export function buildStampFramePath(): SkPath {
  try {
    const outer = Skia.Path.MakeFromSVGString(STAMP_FRAME_OUTER_SVG);
    const inner = Skia.Path.MakeFromSVGString(STAMP_FRAME_WINDOW_SVG);
    if (!outer || !inner) return fallbackFramePath();
    outer.addPath(inner);
    return outer;
  } catch {
    return fallbackFramePath();
  }
}
