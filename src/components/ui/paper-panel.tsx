import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { SurfaceWearLayer } from '@/components/ui/surface-wear-layer';
import { Colors, Spacing, StickerAccents } from '@/constants/theme';
import { svgDataUri } from '@/lib/base64';
import { randomFor } from '@/lib/seeded-random';
import { buildSurfaceWear } from '@/lib/surface-wear';

type PaperPanelProps = {
  children: React.ReactNode;
  seed: string;
  // Ties the panel to the same accent set the tickets and stickers use. Left
  // off entirely for panels that are containers rather than choices.
  accentIndex?: number;
  style?: ViewStyle;
  // For a card whose content is MEANT to hang past its edge — a feed rating
  // stamp seeping over the corner, say. The decoration below always clips to
  // the rounded rect regardless; this only stops the panel clipping its
  // children.
  allowOverflow?: boolean;
  // Corner rounding, for a panel that should be sharper still (see
  // JournalPage). PANEL_RADIUS when left out.
  radius?: number;
};

// A section of a form, as a piece of paper rather than a hairline rectangle.
//
// The review form's sections were `borderWidth: 1` boxes in translucent
// cream — the only container treatment of its kind in the app. Everything
// else that groups content is a solid raised panel, so these read as wireframe
// next to their own neighbours: the rating slider inside one of them is the
// most crafted object in the product, sitting in a box drawn with a hairline.
//
// Solid fill, one light, a little print wear — the same surface the tickets
// use, minus the ticket. The accent stripe along the top edge is the only
// borrowed motif, and it is along the TOP rather than the side so a column of
// these does not start looking like a column of tickets.
// Layout that describes what is IN the panel rather than the panel itself.
//
// Children are drawn inside `body`, not directly in the outer view, so a
// caller's `style` used to land on a box whose only children were the
// decoration and that one body column. Every caller that asked for a row
// got a column: on Search a person came out as avatar, then name, then
// handle, then Follow, stacked into a card a third of a screen tall, and the
// same on blocked accounts, home locations, follow requests and travel book
// entries. Padding doubled up the same way (theirs outside, the body's 16
// inside) and every `gap` was ignored. Splitting the style sends these to
// the body, where they mean what the caller wrote; size, position and
// margins stay on the panel.
const CONTENT_KEYS = new Set([
  'flexDirection',
  'flexWrap',
  'alignItems',
  'justifyContent',
  'alignContent',
  'gap',
  'rowGap',
  'columnGap',
  'padding',
  'paddingVertical',
  'paddingHorizontal',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingStart',
  'paddingEnd',
]);

function splitStyle(style: ViewStyle | undefined): { panel: ViewStyle; content: ViewStyle } {
  const panel: Record<string, unknown> = {};
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(StyleSheet.flatten(style) ?? {})) {
    (CONTENT_KEYS.has(key) ? content : panel)[key] = value;
  }
  return { panel: panel as ViewStyle, content: content as ViewStyle };
}

export function PaperPanel({
  children,
  seed,
  accentIndex,
  style,
  allowOverflow = false,
  radius,
}: PaperPanelProps) {
  const wear = useMemo(() => buildSurfaceWear(`panel:${seed}`), [seed]);
  const accent =
    accentIndex == null ? null : StickerAccents[accentIndex % StickerAccents.length];
  const band = useMemo(() => (accent ? svgDataUri(bandSvg(accent, seed)) : null), [accent, seed]);
  const { panel, content } = splitStyle(style);

  return (
    <View style={[styles.panel, allowOverflow && styles.noClip, radius != null && { borderRadius: radius }, panel]}>
      {/* Every decorative layer lives in here, and THIS is what clips to the
          rounded rect — not the panel itself. Separating them is what lets a
          card hold something that deliberately hangs past its edge without
          the gloss spilling square corners over the rounding. */}
      <View style={[styles.decoration, radius != null && { borderRadius: radius }]} pointerEvents="none">
      {band && <Image source={{ uri: band }} style={styles.stripe} contentFit="fill" />}
      <SurfaceWearLayer wear={wear} />
      </View>

      <View style={[styles.body, content]}>{children}</View>
    </View>
  );
}

// Corners of a piece of card, not of an app's tile. These were 16, the same
// rounding as every other surface in every other app, and a column of them
// was most of what made screens like Settings read as blocks.
const PANEL_RADIUS = 6;
const BAND_HEIGHT = 7;

// The accent along the top edge, painted on with a brush rather than ruled:
// its top is the card's edge, and its bottom wavers and thins where the
// brush ran dry. It was a perfectly even four-point bar.
//
// Drawn on a small canvas and stretched to the panel's width. That is safe
// because it is all fill and no stroke, so nothing has a line width to
// distort. Its pixel size is several times its view box so the stretched
// image stays sharp.
function bandSvg(colour: string, seed: string): string {
  const random = randomFor(`band-${seed}`);
  const W = 200;
  const steps = 26;
  const dryAt = random() < 0.5 ? 0.06 + random() * 0.2 : 0.74 + random() * 0.2;
  let edge = '';
  for (let i = steps; i >= 0; i--) {
    const x = (i / steps) * W;
    // Thinner towards the end the brush ran dry at.
    const dry = Math.max(0, 1 - Math.abs(i / steps - dryAt) * 5);
    const y = 4.4 + (random() - 0.5) * 2.2 - dry * 2.2;
    edge += ` L${x.toFixed(1)} ${Math.max(1.2, y).toFixed(2)}`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${BAND_HEIGHT * 4}" viewBox="0 0 ${W} ${BAND_HEIGHT}" preserveAspectRatio="none">` +
    `<path d="M0 0 L${W} 0${edge} Z" fill="${colour}"/>` +
    `</svg>`
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: Colors.backgroundElement,
    borderRadius: PANEL_RADIUS,
    overflow: 'hidden',
  },
  noClip: {
    overflow: 'visible',
  },
  // Absolutely filling the panel and clipping itself, so the gloss and the
  // wear follow the rounded corners even when the panel does not clip.
  decoration: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: PANEL_RADIUS,
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: BAND_HEIGHT,
  },
  body: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
});
