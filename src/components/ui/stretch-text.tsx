import { useState } from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  View,
  type TextLayoutEventData,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { OutlinedText } from '@/components/ui/outlined-text';
import { ThemedText, type ThemedTextProps } from '@/components/themed-text';

type StretchTextProps = ThemedTextProps & {
  children: string;
  outline?: boolean;
};

// Measures the text's true single-line intrinsic width, then scales it
// horizontally to exactly fill its container.
//
// Renders the text itself (not arbitrary children) specifically so
// `numberOfLines={1}` can be forced directly on it — that turned out to be
// the only reliable way to guarantee single-line rendering. Earlier
// attempts tried to prevent wrapping indirectly via the wrapping View's
// `alignSelf: 'flex-start'` + `flexShrink: 0`, which worked in some
// ancestor contexts (a flex:1 row cell, a plain padded box) but not others
// (nested inside a percentage-width column with justifyContent set) —
// worth remembering if this component is ever generalized past text.
//
// Root-caused on both platforms (two prior rounds of guess-and-revert never
// got this far — this time by reading actual computed styles on web and an
// on-screen debug readout on native, not re-reading this source and
// guessing). Two genuinely different bugs, both producing the same visible
// symptom (premature ellipsis truncation instead of a stretched fit):
// - **Web**: react-native-web's `numberOfLines`-driven ellipsis machinery
//   ties an implicit `max-width` to the containing block, silently capping
//   the *visible* copy's layout width to its container's width instead of
//   its content's. Fixed by `styles.noMaxWidth` (`maxWidth:'none'`, a CSS
//   value Yoga doesn't understand, hence web-only).
// - **Native**: the *measuring* copy under-measured, two compounding ways —
//   confirmed with an on-screen debug readout, not guessed: (1) `onLayout`
//   reported this copy's box capped to the container's width regardless of
//   `position:absolute` + `alignSelf:'flex-start'`, so switching to
//   `onTextLayout` (real text-shaping metrics from the render, not the
//   surrounding box's layout size) was necessary; but (2) without an
//   explicit `numberOfLines={1}` *and* an absurdly wide explicit `width`
//   (`styles.measureText`), the still-constrained box made the text wrap,
//   and `onTextLayout` then faithfully reported only the first wrapped
//   line's width — correct data, wrong question. Both together (uncapped
//   width, forced single line) were needed before `onTextLayout` finally
//   reported the text's true natural width. The visible copy also gets an
//   explicit `width: contentWidth` now (not just on web) since Yoga on
//   native otherwise still ignores `flexShrink:0`/`alignSelf:'flex-start'`
//   for it, same underlying pattern as the max-width fix above — confirmed
//   by forcing an oversized width on the visible copy and watching it
//   actually render wider, proving its own width mechanism was fine all
//   along and the upstream measurement was the lie.
//
// Stretching/compressing is a deliberate editorial touch for text that's
// already close to its container's width — it looks wrong (visibly
// distorted) applied to a short word blown up several times over, or a long
// one crushed down thin. Outside this range, the box grows taller instead:
// text renders at its natural size and is allowed to wrap (no numberOfLines
// cap — an earlier version capped this fallback at 2 lines, which silently
// re-truncated with an ellipsis anything needing a 3rd line, defeating the
// whole "let the box grow" fallback for any sufficiently long text).
//
// `outline` (only ever used for headline text sitting on top of a photo,
// e.g. ReviewPromptCard) opts out of that grow-the-box fallback entirely:
// its container is a fixed-size band ("bottom third of the image"), not a
// box that can grow with content, so wrapping there just means the text
// overflows past the band's own top edge instead. For that case the
// coherent behavior is what was actually asked for — fill the band as
// closely as possible, both horizontally *and* vertically, anchored to its
// bottom edge (matching a reference design of bold, edge-to-edge, vertically
// stretched place-name text sitting flush at the photo's bottom) — rather
// than wrapping or leaving the band under-filled. This is a real non-uniform
// stretch (scaleX and scaleY computed independently against the band's
// actual measured width/height), the same "distort short/long text to
// exactly fill a box" editorial treatment as the horizontal-only case below,
// just applied on both axes for this one call site. Both axes are capped
// (OUTLINE_MAX_SCALE_X/Y below) rather than filling *exactly* — a short word
// in a wide band would otherwise need a huge scaleX, and past a fairly low
// multiple the fixed-width outline stroke stops looking like a bold outline
// and starts visibly garbling narrow letterforms into blob shapes. A capped
// short word doesn't fully reach the band's edge; that's an accepted
// trade-off for staying legible, not a bug.
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.3;
// outline mode's floor is a defensive epsilon, not a design constraint —
// unlike MIN_SCALE above (which exists specifically to avoid *visible*
// distortion by falling back to wrapping instead), outline mode's whole
// point is to always fill its band exactly, however much compression that
// takes, since it can't wrap or grow. A real design-intent floor here
// (previously 0.3) caused a genuine bug: a long name in a narrow card
// needed *more* compression than that to fit, so scaleX got clamped before
// the box was actually narrow enough, and the box's own overflow:'hidden'
// safety net silently clipped the last few characters instead.
const OUTLINE_MIN_SCALE = 0.05;
// Unlike horizontal compression, vertical stretching breaks letterform
// legibility fast — a small base font size stretched to fill a much taller
// band (a tall portrait-ish band relative to that font, or simply the full
// 33% band vs. a normal single-line height) needs a *large* scaleY, and past
// roughly 1.5-2x text stops looking "bold and tall" and starts looking like
// unrecognizable warped shapes, potentially pushed up past the band's own
// top edge into the photo above it (transforms don't affect layout, so nothing
// stops a large enough scaleY from visually overflowing where it started).
// Capped here; `ReviewPromptCard` also gives the base font size a sensible
// starting point so the *required* stretch to reach this cap stays modest
// rather than needing 3-4x+ from a small fixed base.
const OUTLINE_MAX_SCALE_Y = 1.6;
// scaleX needs the same kind of cap, for a different reason than
// MIN_SCALE's *lower* bound above: a short word (e.g. "Paris") in a wide
// band computes a huge rawScale (confirmed on web via computed styles: 3.56x
// for a real case), and extreme stretch on either axis compounds the outline
// legibility problem described below at OUTLINE_STROKE_RADIUS. Same cap
// value as OUTLINE_MAX_SCALE_Y for a consistent, moderate amount of allowed
// distortion on both axes.
const OUTLINE_MAX_SCALE_X = 1.6;
// `OutlinedText`'s outline (a CSS `text-shadow` with this blur radius, see
// that file) is painted at the *pre-transform* font size and then the whole
// element — glyphs and shadow together — gets visually stretched by
// scaleX/scaleY. A fixed radius therefore grows right along with the scale:
// at scaleX 1.6 a radius-2 shadow reads as ~3.2px, which is enough to fill
// in the counters of narrow lowercase letters (r, i, s) entirely, leaving
// solid blobs, while thicker capital strokes (P, A) survive. Confirmed via
// live DOM inspection: `textContent` was the full untruncated word the whole
// time (never an ellipsis, despite years of this bug being described as
// "text getting cut off with ...") — the "missing" letters were actually
// present and rendering, just visually swallowed by their own outline. The
// fix is to divide the radius by the applied scale so the *rendered* size
// stays constant regardless of how much the text is stretched, same
// principle as the scaleX/scaleY caps above but applied to the outline
// instead of the text itself.
const OUTLINE_STROKE_RADIUS = 2;
// The actual, final root cause of the long-reported web "cuts off with an
// ellipsis" bug (the scaleX cap and outline-radius fix above were real
// secondary bugs found along the way, not this one). Confirmed via direct
// DOM mutation on the live broken element: forcing a wider explicit `width`
// made the full word render instantly; forcing `overflow`/`textOverflow`
// off did too. The `width: contentWidth` set below is meant to be an exact
// fit (see that comment), but `contentWidth` comes from a *different*
// element (the offscreen measuring copy) than the one it's applied to, and
// the two don't always resolve to identical rendered pixel widths — even a
// sub-pixel shortfall is enough to make Chromium's `numberOfLines`-driven
// ellipsis machinery decide the text overflows, and with a wide bold
// display font it can jump straight from "fits all 5 letters" to "PA…"
// rather than truncating gradually (confirmed: `scrollWidth === clientWidth`
// looked clean, because Chromium reports the *post-ellipsis* scrollWidth
// here, not the natural content size — yet another shape of the
// text-overflow-isn't-reliably-inspectable-via-scrollWidth trap noted
// elsewhere in this file). Fixed two ways together: a small safety margin on
// the applied width so it's never sitting exactly on that knife's edge, and
// `noEllipsis` below as a backstop so even a residual sub-pixel shortfall
// clips silently instead of showing "…".
const WEB_WIDTH_SAFETY_MARGIN = 2;

export function StretchText({ children, outline, style, ...rest }: StretchTextProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const rawScale = containerWidth > 0 && contentWidth > 0 ? containerWidth / contentWidth : 1;
  // outline mode never wraps — see comment above — so it always takes the
  // single-line/scaleX path, just with its own much lower floor than the
  // regular grow-or-stretch boxes.
  const withinRange = outline || (rawScale >= MIN_SCALE && rawScale <= MAX_SCALE);
  const scaleX = outline
    ? Math.min(Math.max(rawScale, OUTLINE_MIN_SCALE), OUTLINE_MAX_SCALE_X)
    : withinRange
      ? rawScale
      : 1;
  const rawScaleY = containerHeight > 0 && contentHeight > 0 ? containerHeight / contentHeight : 1;
  const scaleY = outline
    ? Math.min(Math.max(rawScaleY, OUTLINE_MIN_SCALE), OUTLINE_MAX_SCALE_Y)
    : 1;
  // See OUTLINE_STROKE_RADIUS above: shrink the pre-transform radius as the
  // applied scale grows, so the outline's *rendered* size stays constant
  // instead of growing right along with the text and swallowing thin
  // letterforms.
  const outlineStrokeRadius = OUTLINE_STROKE_RADIUS / Math.max(scaleX, scaleY, 1);
  const Text = outline ? OutlinedText : ThemedText;

  function handleMeasureTextLayout(e: NativeSyntheticEvent<TextLayoutEventData>) {
    const line = e.nativeEvent.lines[0];
    if (line?.width) setContentWidth(line.width);
    if (line?.height) setContentHeight(line.height);
  }

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => {
        setContainerWidth(e.nativeEvent.layout.width);
        setContainerHeight(e.nativeEvent.layout.height);
      }}
      style={[styles.container, outline ? styles.fillHeight : null]}>
      {/* The measuring copy must share every font-affecting style (size,
          weight, etc.) with the visible copy — otherwise its measured width
          corresponds to a different font size than what's actually
          rendered, and the computed scaleX is wrong for the real text.
          Platform-split measurement — each platform needs a genuinely
          different approach, confirmed empirically (not assumed) on both:
          - **Web**: `onLayout` on a `position:fixed` copy (below) correctly
            reports the natural width — that part of the original design
            was never broken. `onTextLayout` was tried as a single
            cross-platform replacement but doesn't fire reliably on
            react-native-web, silently leaving `contentWidth` at 0 forever
            (which, combined with the `rawScale` 0-fallback defaulting
            `withinRange` to true, reproduced a *different* bug: the visible
            copy rendering unscaled and uncapped, overflowing its container).
          - **Native**: `onLayout` under-measures (see `styles.measureText`
            below for why), so `onTextLayout` — real text-shaping metrics,
            immune to the surrounding box's layout constraints — is used
            instead, and does fire reliably there. */}
      <View style={styles.measure} pointerEvents="none">
        {Platform.OS === 'web' ? (
          <Text
            {...rest}
            numberOfLines={1}
            onLayout={(e: LayoutChangeEvent) => {
              setContentWidth(e.nativeEvent.layout.width);
              setContentHeight(e.nativeEvent.layout.height);
            }}
            style={[styles.nowrap, style]}>
            {children}
          </Text>
        ) : (
          <Text
            {...rest}
            numberOfLines={1}
            onTextLayout={handleMeasureTextLayout}
            style={[styles.nowrap, style, styles.measureText]}>
            {children}
          </Text>
        )}
      </View>
      {(() => {
        const visibleStyle: StyleProp<TextStyle> = [
          withinRange ? styles.nowrap : styles.wrap,
          style,
          withinRange ? styles.noMaxWidth : null,
          withinRange ? noEllipsisStyle : null,
          // Explicit numeric width, scoped to only this single-line/scaleX
          // path (never the wrap fallback): forces the correct pre-transform
          // layout box on both platforms — `maxWidth:'none'` above is a web
          // CSS value Yoga ignores on native, so native needs this instead
          // to stop capping the visible copy to the container's width. The
          // web-only safety margin (see WEB_WIDTH_SAFETY_MARGIN above)
          // keeps this off the sub-pixel knife's edge that was silently
          // truncating text with an ellipsis; native's onTextLayout
          // measurement has no such discrepancy, so it stays exact there.
          withinRange && contentWidth > 0
            ? { width: contentWidth + (Platform.OS === 'web' ? WEB_WIDTH_SAFETY_MARGIN : 0) }
            : null,
          // outline mode is bottom-anchored (`placeOverlay` in
          // ReviewPromptCard justifies its content to the end) and stretched
          // from that bottom edge upward, so the filled band reads as
          // flush with the photo's bottom rather than centered within it.
          { transform: [{ scaleX }, { scaleY }], transformOrigin: outline ? 'left bottom' : 'left' },
        ];
        // strokeRadius is an OutlinedText-only prop (unknown to ThemedText),
        // so the two branches can't share one dynamic `Text` component here
        // the way the measuring copy above does.
        return outline ? (
          <OutlinedText {...rest} numberOfLines={1} strokeRadius={outlineStrokeRadius} style={visibleStyle}>
            {children}
          </OutlinedText>
        ) : (
          <ThemedText {...rest} numberOfLines={withinRange ? 1 : undefined} style={visibleStyle}>
            {children}
          </ThemedText>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  // outline-mode-only: without an explicit height, this View's own onLayout
  // just reports its natural content-driven height (close to the text's own
  // height, near-self-referential) instead of the full band it's meant to
  // fill — `height:'100%'` makes it actually stretch to match `placeOverlay`
  // (which has a real resolved height via its own `height:'33%'`), so
  // `containerHeight` reflects the true available space to fill vertically.
  fillHeight: {
    height: '100%',
  },
  measure: {
    position: Platform.OS === 'web' ? ('fixed' as ViewStyle['position']) : 'absolute',
    opacity: 0,
    // Without this, native Yoga stretches an absolutely-positioned child
    // with no explicit alignSelf to match its parent's cross-axis width by
    // default (unlike web's CSS shrink-to-fit default for position:
    // absolute) — capping this measuring View itself to the container's
    // width before its Text child ever gets a chance to size to content.
    alignSelf: 'flex-start',
  },
  nowrap: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    minWidth: 0,
  },
  // An explicit, deliberately absurd width — every attempt to get this
  // measuring Text an *unconstrained* box via layout properties alone
  // (position:absolute, alignSelf:flex-start) still measured it as capped
  // to the container's width on native. An explicit numeric width reliably
  // overrides that (confirmed empirically: forcing one on the *visible*
  // copy did make it render wider), so it's used here too, purely to give
  // this single-line, off-screen copy room to never wrap or truncate
  // before `onTextLayout` reports its true rendered width.
  measureText: {
    width: 5000,
  },
  // web-only: react-native-web's numberOfLines-driven single-line
  // truncation implementation ties a max-width to the containing block
  // (needed to make its ellipsis machinery meaningful) — which silently
  // caps this Text's own layout width to its *container's* width instead
  // of its natural single-line content width, regardless of
  // flexShrink:0/alignSelf:'flex-start'. Confirmed via computed styles: the
  // visible copy's pre-transform layout box measured exactly the
  // container's width, not the content's, in every case tested. Overriding
  // it directly is what actually fixes the truncation.
  noMaxWidth: {
    // 'none' is a valid CSS max-width value (web-only usage here, guarded
    // by the Platform.OS check above) but isn't in RN's own DimensionValue
    // type, hence the cast.
    maxWidth: 'none' as unknown as number,
  },
  wrap: {
    alignSelf: 'stretch',
  },
});

// Kept out of the StyleSheet.create call above: `textOverflow` isn't a real
// React Native style property at all (unlike `maxWidth`, which just needed a
// value-type workaround) — including it as a key there made TypeScript's
// generic inference fall back to the broad NamedStyles constraint for every
// other key in that object too, breaking unrelated styles. See
// WEB_WIDTH_SAFETY_MARGIN above: a backstop for the rare case where the
// applied width is still a hair short of what's actually needed (e.g. a
// screen-specific font/DPI combination this session's testing didn't hit) —
// 'clip' silently drops whatever doesn't fit instead of showing
// react-native-web's default "…", matching the same prefer-silent-clipping
// precedent `noMaxWidth` and the card's own `overflow:'hidden'` already
// establish for this component.
const noEllipsisStyle = { textOverflow: 'clip' } as unknown as TextStyle;
