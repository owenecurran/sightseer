import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { BrandColors, Colors, Spacing, StickerAccents } from '@/constants/theme';
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
}: PaperPanelProps) {
  const { specks, gloss } = useMemo(() => buildSurfaceWear(`panel:${seed}`), [seed]);
  const accent =
    accentIndex == null ? null : StickerAccents[accentIndex % StickerAccents.length];
  const { panel, content } = splitStyle(style);

  return (
    <View style={[styles.panel, allowOverflow && styles.noClip, panel]}>
      {/* Every decorative layer lives in here, and THIS is what clips to the
          rounded rect — not the panel itself. Separating them is what lets a
          card hold something that deliberately hangs past its edge without
          the gloss spilling square corners over the rounding. */}
      <View style={styles.decoration} pointerEvents="none">
      {accent && <View style={[styles.stripe, { backgroundColor: accent }]} />}

      <LinearGradient
        colors={[`rgba(234,231,207,${gloss.peak})`, 'rgba(234,231,207,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: gloss.falloff, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {specks.map((speck, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[
            styles.speck,
            {
              left: speck.left as `${number}%`,
              top: speck.top as `${number}%`,
              width: speck.size,
              height: speck.size,
              borderRadius: speck.size / 2,
              opacity: speck.opacity,
            },
          ]}
        />
      ))}
      </View>

      <View style={[styles.body, content]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: Colors.backgroundElement,
    borderRadius: Spacing.three,
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
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 4,
  },
  speck: {
    position: 'absolute',
    backgroundColor: BrandColors.cream,
  },
  body: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
});
