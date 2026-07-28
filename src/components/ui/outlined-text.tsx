import { Platform, type TextStyle } from 'react-native';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { BrandColors } from '@/constants/theme';

type OutlinedTextProps = ThemedTextProps & {
  strokeColor?: string;
};

// Adds a background-colored border around text so it stays legible over a
// photo of unknown brightness. Web gets a crisp CSS text-stroke (fully
// verifiable via computed style). Native has no text-stroke primitive, so
// it falls back to a soft textShadow-based outline — lower fidelity, and
// unverifiable in this web-only testing environment, flagged rather than
// claimed equivalent to the web treatment.
export function OutlinedText({ strokeColor = BrandColors.background, style, ...rest }: OutlinedTextProps) {
  const outlineStyle: TextStyle =
    Platform.OS === 'web'
      ? // React's own inline-style convention capitalizes vendor prefixes
        // (`WebkitTextStrokeWidth`) — the opposite of raw DOM CSSOM property
        // names, which use a lowercase leading letter (`webkitTextStroke...`,
        // valid for direct `element.style.foo = ...` assignment but flagged
        // by React as an unsupported/unrecognized property name and not
        // reliably applied through its own style-setting path).
        ({ WebkitTextStrokeWidth: '1px', WebkitTextStrokeColor: strokeColor } as unknown as TextStyle)
      : {
          textShadowColor: strokeColor,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 2,
        };

  return <ThemedText {...rest} style={[style, outlineStyle]} />;
}
