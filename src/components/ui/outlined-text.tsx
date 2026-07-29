import { type TextStyle } from 'react-native';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { BrandColors } from '@/constants/theme';

type OutlinedTextProps = ThemedTextProps & {
  strokeColor?: string;
  // In CSS pixels, pre-transform — see stretch-text.tsx's
  // OUTLINE_STROKE_RADIUS comment for why callers under a scale transform
  // must shrink this as the scale grows.
  strokeRadius?: number;
};

// Adds a background-colored border around text so it stays legible over a
// photo of unknown brightness. Only ever rendered by `StretchText`'s
// `outline` mode, i.e. always under a `scaleX`/`scaleY` transform.
//
// Web used to get a crisp CSS `-webkit-text-stroke` here instead of this
// textShadow approach — verifiable via computed style, and correct in
// isolation, but it doesn't survive a non-1.0 scale transform: the stroke is
// painted as part of the glyph raster at the pre-transform size, and the
// transform then stretches that raster rather than re-stroking at the final
// size. Confirmed via live screenshots at every deviceScaleFactor (1 through
// 2, so never a DPI issue) with a real short word ("Paris") in a wide band:
// narrow letterforms (R, I, S) had their stroke dragged into solid blob
// shapes while wider ones (P, A) partially survived — this was the actual
// cause of the long-reported "garbled web text" bug, not an ellipsis and not
// caching (reproduced from a cold incognito-equivalent Playwright context).
// Capping the scale (see OUTLINE_MAX_SCALE_X/Y in stretch-text.tsx) made it
// less severe but did not fix it even at a modest 1.6x. Native's textShadow
// fallback below was never affected — text-shadow is a normal paint
// operation, not a separately-rasterized-then-stretched effect — and held up
// fine on native even at a comparable scale, so it's now used unconditionally
// on both platforms instead of being a lower-fidelity native-only fallback.
export function OutlinedText({
  strokeColor = BrandColors.background,
  strokeRadius = 2,
  style,
  ...rest
}: OutlinedTextProps) {
  const outlineStyle: TextStyle = {
    textShadowColor: strokeColor,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: strokeRadius,
  };

  return <ThemedText {...rest} style={[style, outlineStyle]} />;
}
