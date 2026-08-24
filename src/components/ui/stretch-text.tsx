import { useState } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextLayoutEventData,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { ThemedText, type ThemedTextProps } from "@/components/themed-text";
import { OutlinedText } from "@/components/ui/outlined-text";

type StretchTextProps = ThemedTextProps & {
  children: string;
  outline?: boolean;
  fill?: boolean;
  fillHeight?: boolean;
  // `fillHeight` modifier: scale to *exactly* the container's height rather
  // than deliberately overshooting it. fillHeight's default behavior
  // (FILL_HEIGHT_OVERSHOOT + VISUAL_LIFT_RATIO below) intentionally pushes
  // the rendered text past its own box, top and bottom, so the visible ink
  // — which is smaller than the layout box it's measured from — still fills
  // an overlay band edge to edge. That's right for a band drawn *over*
  // something (placeOverlay), and wrong for a box with real content
  // directly above it, where the overshoot just covers that content (see
  // teaser-card.tsx: the stretched title was overlapping the section label
  // above it). With this set, the two compensations zero out and the
  // transform math lands the scaled text exactly on the container's own
  // top and bottom edges.
  fillHeightExact?: boolean;
  // On by default: long names are cut rather than crushed (see
  // TRUNCATE_THRESHOLD). Opt out where the full string genuinely matters
  // more than its legibility at a glance.
  truncateLongText?: boolean;
};

// Past this many characters a name is truncated rather than stretched to
// fit. `fill` mode has no lower bound worth relying on -- it will happily
// compress a 40-character place name into a card's width, at which point the
// letterforms are too narrow to read and the point of the stretch is lost.
// Cutting is more legible than crushing.
//
// The two numbers differ on purpose: a name only slightly over the limit
// would gain nothing from losing four characters plus an ellipsis, so
// nothing is cut until it is comfortably past, and then it is cut back far
// enough to be worth having done.
const TRUNCATE_THRESHOLD = 24;
const TRUNCATE_AT = 20;

const MIN_SCALE = 0.85;
const MAX_SCALE = 1.3;
const OUTLINE_MIN_SCALE = 0.05;
const FILL_MIN_SCALE = 0.15;
// Ceiling for `fill` mode. Without one, scaleX is just
// containerWidth/contentWidth with only a floor applied, so a short title
// in a wide column stretches without bound — invisible on a phone (narrow
// containers keep the ratio near 1) but glaring on a desktop-width window,
// where a two-word place name was being smeared across the whole column.
// Capping it means very short text stops short of filling the full width
// on large screens, which is the intended trade: fill is a look, not a
// requirement to touch both edges.
const FILL_MAX_SCALE = 2.2;

const OUTLINE_OVERSHOOT = 1.02;
const FILL_HEIGHT_OVERSHOOT = 1.25;

// Ceiling on `fill`'s vertical compensation, applied only to a name shown in
// full past TRUNCATE_THRESHOLD (see `truncateLongText`).
//
// `fill` normally trades horizontal compression for vertical stretch —
// 1/sqrt(scaleX) — so squeezed text keeps its visual weight. That works
// while the squeeze is mild, but a name long enough to have been truncated
// is squeezed hard, and the compensation then makes it *both* very narrow
// and very tall: 40 characters would land at scaleX 0.5 and scaleY 1.41,
// which is where the letterforms stop being readable. Capping the vertical
// half lets the full name stay on screen without towering over the card.
//
// Deliberately NOT applied when the text is being truncated: a cut name is
// short enough that the compensation is doing its intended job, and the
// compact tiles (teaser cards, collection rows) rely on that look.
const LONG_TEXT_MAX_SCALE_Y = 1.15;

function fillScaleY(scaleX: number, maxScaleY?: number): number {
  if (scaleX >= 1) return 1;
  const compensated = 1 / Math.sqrt(scaleX);
  return maxScaleY != null ? Math.min(compensated, maxScaleY) : compensated;
}
const OUTLINE_STROKE_RADIUS = 2;
const WEB_WIDTH_SAFETY_MARGIN = 2;

// Trailing whitespace is trimmed before the ellipsis so a cut landing on a
// space does not render as "Seattle Public …".
function truncate(text: string): string {
  if (text.length <= TRUNCATE_THRESHOLD) return text;
  return text.slice(0, TRUNCATE_AT).trimEnd() + '…';
}

export function StretchText({
  children: rawChildren,
  outline,
  fill,
  fillHeight,
  fillHeightExact,
  truncateLongText = true,
  style,
  ...rest
}: StretchTextProps) {
  // Applied once, up front, so the measuring copy and the visible copy are
  // always the same string -- measuring the full text and rendering a cut
  // one would compute the scale for text that is not on screen.
  const children = truncateLongText ? truncate(rawChildren) : rawChildren;
  // A name past the cut-off that is being shown in full anyway — the one
  // case where the vertical compensation needs a ceiling. See
  // LONG_TEXT_MAX_SCALE_Y.
  const isUntruncatedLongName =
    !truncateLongText && rawChildren.length > TRUNCATE_THRESHOLD;
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const rawScale =
    containerWidth > 0 && contentWidth > 0 ? containerWidth / contentWidth : 1;
  // outline and fill both never wrap — see comments above — so they always
  // take the single-line/scaleX path, just with their own floors (each
  // lower than MIN_SCALE below) instead of the regular grow-or-stretch box's
  // narrower window.
  const alwaysFit = outline || fill;
  const withinRange =
    alwaysFit || (rawScale >= MIN_SCALE && rawScale <= MAX_SCALE);
  const scaleX = alwaysFit
    ? (outline
        ? Math.max(rawScale, OUTLINE_MIN_SCALE) * OUTLINE_OVERSHOOT
        // Clamped at both ends for fill — see FILL_MAX_SCALE.
        : Math.min(Math.max(rawScale, FILL_MIN_SCALE), FILL_MAX_SCALE))
    : 1;
  const rawScaleY =
    containerHeight > 0 && contentHeight > 0
      ? containerHeight / contentHeight
      : 1;
  const scaleY = outline
    ? Math.max(rawScaleY, OUTLINE_MIN_SCALE)
    : fill
      ? fillHeight
        ? Math.max(rawScaleY, FILL_MIN_SCALE) *
          (fillHeightExact ? 1 : FILL_HEIGHT_OVERSHOOT)
        : fillScaleY(scaleX, isUntruncatedLongName ? LONG_TEXT_MAX_SCALE_Y : undefined)
      : 1;
  // The centered-growth correction for `fillHeight` (and the plain
  // default case, where it's always a no-op since scaleY is 1 there) —
  // see its own comment at the transform/transformOrigin call site below
  // for why this replaced a percentage-based transformOrigin entirely
  // instead of trying to fix its Y value directly.
  //
  // Mathematically this centers the *layout* box (`contentHeight`, the
  // font's full ascent+descent+leading metric — see FILL_HEIGHT_OVERSHOOT's
  // own comment above for that same box-vs-ink distinction) — but most
  // fonts, this one included, reserve more of that box above the baseline
  // than below it, so a box centered by *that* metric still reads as
  // sitting low relative to the visible ink itself. `VISUAL_LIFT_RATIO`
  // nudges it back up by a modest, empirical fraction — per direct request
  // not to re-run the live emulator/screenshot verification loop again this
  // round, this value is a reasoned estimate (typical ascent-over-descent
  // skew for a display/grotesk font like ObviouslyWideMedium), not one
  // freshly measured against this exact render — worth a quick visual
  // recheck next time this file is touched, and re-tuning this one constant
  // if it's still off rather than revisiting the centering math again.
  //
  // Zeroed under `fillHeightExact` (see that prop) — with both this and the
  // overshoot neutralized, the remaining `(contentHeight * (1 - scaleY))/2`
  // term exactly cancels the container's own justifyContent:'center' inset,
  // putting the scaled text's top edge on the container's top edge and its
  // bottom on the container's bottom.
  const VISUAL_LIFT_RATIO = fillHeightExact ? 0 : 0.1;
  const centeredGrowthTranslateY =
    (contentHeight * (1 - scaleY)) / 2 -
    contentHeight * scaleY * VISUAL_LIFT_RATIO;
  // fill's vertical compensation grows the *visible* text past its natural
  // single-line height via transform, which (unlike outline's band, sized by
  // its own layout already) doesn't itself resize this container — without
  // this, the container stays at the pre-compensation height and the taller
  // text either gets clipped by a container that clips, or (this container
  // doesn't) visually overlaps whatever sits below it in the surrounding
  // layout. Reserving the real scaled height here keeps sibling spacing
  // (row gaps, etc.) correct instead of just hoping it doesn't collide.
  // `fillHeight` skips this entirely — there, the container's height is the
  // *given* (a real, externally-established box, e.g. a flex:1 row), not
  // something to grow from the text's own pre-transform size.
  const containerHeightOverride =
    fill && !fillHeight && contentHeight > 0 && scaleY > 1
      ? contentHeight * scaleY
      : undefined;
  // See OUTLINE_STROKE_RADIUS above: shrink the pre-transform radius as the
  // applied scale grows, so the outline's *rendered* size stays constant
  // instead of growing right along with the text and swallowing thin
  // letterforms.
  const outlineStrokeRadius =
    OUTLINE_STROKE_RADIUS / Math.max(scaleX, scaleY, 1);
  const Text = outline ? OutlinedText : ThemedText;

  function handleMeasureTextLayout(
    e: NativeSyntheticEvent<TextLayoutEventData>,
  ) {
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
      style={[
        styles.container,
        outline ? styles.fillHeightBand : null,
        // `fillHeight` needs its own height to be the real, externally-given
        // one (see the prop's own comment) — without this, an ordinary
        // block child (no flex/height of its own) just shrinks to its
        // content's natural height regardless of how much room its `flex:1`
        // *parent* (categoryTextWrap, in the one current caller) actually
        // has, and `containerHeight` below would measure that same
        // self-referential natural size instead of the real box.
        fill && fillHeight ? styles.fillHeightSelf : null,
        // fill's vertical compensation (containerHeightOverride above) grows
        // this box past the text's natural height — bottom-anchoring it here
        // means that extra room accumulates *above* the text instead of
        // being split above/below by the base style's centering, so
        // whatever sits right after this box in the surrounding layout
        // (e.g. the location line under a feed card's title) stays flush
        // against the text instead of getting pushed down by empty space.
        fill && containerHeightOverride ? styles.fillBottom : null,
        containerHeightOverride ? { height: containerHeightOverride } : null,
      ]}
    >
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
        {Platform.OS === "web" ? (
          <Text
            {...rest}
            numberOfLines={1}
            onLayout={(e: LayoutChangeEvent) => {
              setContentWidth(e.nativeEvent.layout.width);
              setContentHeight(e.nativeEvent.layout.height);
            }}
            style={[styles.nowrap, styles.tightFont, style]}
          >
            {children}
          </Text>
        ) : (
          <Text
            {...rest}
            numberOfLines={1}
            onTextLayout={handleMeasureTextLayout}
            style={[styles.nowrap, styles.tightFont, style, styles.measureText]}
          >
            {children}
          </Text>
        )}
      </View>
      {(() => {
        const visibleStyle: StyleProp<TextStyle> = [
          withinRange ? styles.nowrap : styles.wrap,
          styles.tightFont,
          style,
          withinRange ? styles.noMaxWidth : null,
          withinRange ? noEllipsisStyle : null,

          withinRange && contentWidth > 0
            ? {
                width:
                  contentWidth +
                  (Platform.OS === "web" ? WEB_WIDTH_SAFETY_MARGIN : 0),
              }
            : null,

          {
            transform:
              outline || (fill && !fillHeight)
                ? [{ scaleX }, { scaleY }]
                : [
                    { translateY: centeredGrowthTranslateY },
                    { scaleX },
                    { scaleY },
                  ],
            transformOrigin:
              outline || (fill && !fillHeight) ? "left bottom" : "0% 0%",
          },
        ];
        // strokeRadius is an OutlinedText-only prop (unknown to ThemedText),
        // so the two branches can't share one dynamic `Text` component here
        // the way the measuring copy above does.
        return outline ? (
          <OutlinedText
            {...rest}
            numberOfLines={1}
            strokeRadius={outlineStrokeRadius}
            style={visibleStyle}
          >
            {children}
          </OutlinedText>
        ) : (
          <ThemedText
            {...rest}
            numberOfLines={withinRange ? 1 : undefined}
            style={visibleStyle}
          >
            {children}
          </ThemedText>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  // Android-only, no-op elsewhere: `includeFontPadding` (RN default: true on
  // Android) adds extra vertical space above ascenders/below descenders
  // beyond the font's own glyph bounds, sized off the font's design metrics
  // rather than this specific text — often much more generous than the
  // equivalent web/iOS box. Both `fill` and `outline` scale that *whole* box
  // (glyphs and this built-in padding together) via transform, so the padding
  // grows right along with the text instead of staying fixed — the more
  // compensation applied, the more visibly empty the box looks above/below
  // the actual letterforms. Turning it off tightens the measured box (and
  // therefore what gets scaled) to the glyphs themselves on Android; applied
  // to both the measuring and visible copies so measurement matches what's
  // actually rendered.
  tightFont: {
    includeFontPadding: false,
  },
  container: {
    width: "100%",
    // Matters when containerHeightOverride (fill's vertical compensation)
    // makes this box taller than the text's own pre-transform layout height:
    // without this, the text (an ordinary top-anchored flow child) sits at
    // the container's top edge, then grows from there via transform — which
    // pushes it out the *top*, past the container's boundary, instead of the
    // taller box actually containing it. Centering the pre-transform child
    // first means the transform's own vertical growth (from that centered
    // position) fills the taller box symmetrically instead.
    justifyContent: "center",
  },
  // fill-mode-only, see call site above: overrides container's centering so
  // the compensated extra height collects above the text instead of being
  // split, keeping this box's bottom edge flush against whatever sits below
  // it in the surrounding layout.
  fillBottom: {
    justifyContent: "flex-end",
  },
  // outline-mode-only: without an explicit height, this View's own onLayout
  // just reports its natural content-driven height (close to the text's own
  // height, near-self-referential) instead of the full band it's meant to
  // fill — `height:'100%'` makes it actually stretch to match `placeOverlay`
  // (which has a real resolved height via its own `height:'33%'`), so
  // `containerHeight` reflects the true available space to fill vertically.
  fillHeightBand: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "flex-end",
  },
  // `fillHeight` prop's mode: same underlying problem as fillHeightBand
  // above (a plain block child ignoring its flex parent's real height) but
  // a plain in-flow `height:'100%'` fix instead of that one's
  // absolute-positioned band, since this mode's container isn't meant to
  // grow past or overlay anything — its parent already *is* the real box
  // (a flex:1 row), so this only needs to claim 100% of what that parent
  // already gives it.
  fillHeightSelf: {
    height: "100%",
  },
  measure: {
    position:
      Platform.OS === "web" ? ("fixed" as ViewStyle["position"]) : "absolute",
    opacity: 0,
    // Without this, native Yoga stretches an absolutely-positioned child
    // with no explicit alignSelf to match its parent's cross-axis width by
    // default (unlike web's CSS shrink-to-fit default for position:
    // absolute) — capping this measuring View itself to the container's
    // width before its Text child ever gets a chance to size to content.
    alignSelf: "flex-start",
  },
  nowrap: {
    alignSelf: "flex-start",
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
    maxWidth: "none" as unknown as number,
  },
  wrap: {
    alignSelf: "stretch",
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
// precedent `noMaxWidth` establishes for this component.
const noEllipsisStyle = { textOverflow: "clip" } as unknown as TextStyle;
