import { StyleSheet, View, type TextStyle } from 'react-native';

import { StretchText } from '@/components/ui/stretch-text';
import type { HeadlinePlate } from '@/lib/headline-style';

type LayeredHeadlineProps = {
  children: string;
  // The front plate — colour, face and tracking.
  style: TextStyle;
  // Plates printed BEHIND it, in order, each offset from the front one. Empty
  // for the treatments that carry a soft shadow instead.
  back: HeadlinePlate[];
  // Scale the type to the height of the box it is given rather than letting
  // it take its own. The caller sets that box to a fixed share of the card, so
  // every name is lettered at the same size relative to the card it is on
  // instead of at whatever size its own character count happened to produce.
  fillHeight?: boolean;
  // Forwarded from the FRONT copy only — every plate is fitted to the same
  // box and so comes out the same width, and four copies reporting the same
  // number is three too many. See StretchText.
  onRenderedWidth?: (width: number) => void;
};

// A place name printed in more than one colour.
//
// React Native gives a Text node exactly one shadow — a colour, an offset and
// a blur — which covers a soft halo or a single hard offset and nothing else.
// The deco labels these are drawn from are two-colour PRINTS: the same word
// struck twice, in two inks, slightly out of register. Getting that means
// drawing the word more than once, which is what this does.
//
// The copies are absolutely positioned over the front one and shifted by
// `left`/`right` and `top`/`bottom` in pairs rather than by a transform, so
// every copy is handed exactly the same box — StretchText scales the type to
// the box it is given, and a copy in a smaller one would come out at a
// different size and stop registering with the others entirely.
export function LayeredHeadline({
  children,
  style,
  back,
  fillHeight = false,
  onRenderedWidth,
}: LayeredHeadlineProps) {
  return (
    <View style={[styles.stack, fillHeight && styles.stackFill]}>
      {back.map((plate, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[
            styles.plate,
            // Both members of each pair, always. A box shifted by setting only
            // one side is a box of a DIFFERENT SIZE, and these copies are
            // scaled to the box they are handed — so `top: dy` alone made
            // every plate a few pixels taller than the front copy and each
            // one came out at its own scaleY (measured: 1.30 on the front,
            // 1.19 on a plate). The copies then failed to register and the
            // name read as a blur instead of as two inks out of step.
            { left: plate.dx, right: -plate.dx, top: plate.dy, bottom: -plate.dy },
          ]}>
          <StretchText
            type="headline"
            fill
            fillHeight={fillHeight}
            fillHeightExact={fillHeight}
            truncateLongText={false}
            style={[
              style,
              {
                color: plate.color,
                // The front plate's own shadow must not come along with the
                // copies, or every offset is drawn twice over.
                textShadowColor: 'transparent',
                textShadowRadius: 0,
              },
            ]}>
            {children}
          </StretchText>
        </View>
      ))}

      <StretchText
        type="headline"
        fill
        fillHeight={fillHeight}
        fillHeightExact={fillHeight}
        truncateLongText={false}
        onRenderedWidth={onRenderedWidth}
        style={style}>
        {children}
      </StretchText>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'relative',
  },
  // fillHeight needs a real box to scale into — see StretchText's own note on
  // the prop. Filling the caller's height is what supplies one.
  stackFill: {
    flex: 1,
  },
  plate: {
    position: 'absolute',
  },
});
