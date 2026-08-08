import { Skia, type SkPath } from '@shopify/react-native-skia';

// Classic postage-stamp perforated edge: a square with small semicircular
// notches bitten out at regular intervals along all four sides.
//
// Originally built via a boolean Difference (a plain rect minus a row of
// circles straddling each edge, using Path.op) — reverted after confirming
// live that web's CanvasKit WASM build doesn't include the PathOps module
// this needs (`self.makeCombined is not a function`, thrown from
// JsiSkPath.op). Hand-plotted instead with arcToOval, a baseline Skia path
// primitive available identically on native and web, so there's no
// platform-dependent feature gap to work around.
//
// Each notch is one semicircular arc curving *into* the shape's interior.
// Walking the four edges clockwise from the top-left corner (top L->R,
// right T->B, bottom R->L, left B->T), every notch's arc starts 90° further
// around the circle than the previous edge's (180, 270, 0, 90) with the
// same -180° sweep each time — worked out via the actual point geometry
// (start point half a notch-width before the center, end point half a
// notch-width after, arcing through the point radius-distance into the
// shape) once per edge, then confirmed the same four numbers fall out for
// all four by symmetry.
export function buildStampPath(size: number, notchesPerSide = 5): SkPath {
  const spacing = size / notchesPerSide;
  const r = spacing * 0.32;
  const path = Skia.Path.Make();

  const edges = [
    { x1: 0, y1: 0, x2: size, y2: 0, startAngle: 180 }, // top, left -> right
    { x1: size, y1: 0, x2: size, y2: size, startAngle: 270 }, // right, top -> bottom
    { x1: size, y1: size, x2: 0, y2: size, startAngle: 0 }, // bottom, right -> left
    { x1: 0, y1: size, x2: 0, y2: 0, startAngle: 90 }, // left, bottom -> top
  ];

  path.moveTo(0, 0);
  for (const edge of edges) {
    const dx = (edge.x2 - edge.x1) / notchesPerSide;
    const dy = (edge.y2 - edge.y1) / notchesPerSide;
    // Unit step along this edge's own direction — where the notch's start
    // point sits relative to its center, half a notch-width back.
    const ux = dx === 0 ? 0 : Math.sign(dx);
    const uy = dy === 0 ? 0 : Math.sign(dy);

    for (let i = 0; i < notchesPerSide; i++) {
      const cx = edge.x1 + dx * (i + 0.5);
      const cy = edge.y1 + dy * (i + 0.5);
      path.lineTo(cx - ux * r, cy - uy * r);
      path.arcToOval(Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2), edge.startAngle, -180, false);
    }
    path.lineTo(edge.x2, edge.y2);
  }
  path.close();
  return path;
}
