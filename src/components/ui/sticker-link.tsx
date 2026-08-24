import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { StickerArrow } from '@/components/ui/sticker-arrow';
import { Spacing } from '@/constants/theme';

type StickerLinkProps = {
  label: string;
  onPress: () => void;
  // Stable per call site so the sticker keeps one shape and colour rather
  // than reshuffling on every render.
  seed?: string;
  size?: number;
};

// A forward "go here" link with the brand's sticker instead of a bare "→".
//
// The glyph and the sticker are not interchangeable: an arrow character
// inherits the text colour and baseline, while the sticker is artwork that
// has to sit centred beside the label. So this owns the row rather than
// leaving each call site to align it.
export function StickerLink({ label, onPress, seed = 'link', size = 24 }: StickerLinkProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <ThemedText type="small" themeColor="sage">
        {label}
      </ThemedText>
      <StickerArrow direction="right" size={size} seed={seed} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.6,
  },
});
