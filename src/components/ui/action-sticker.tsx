import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, StickerAccents } from '@/constants/theme';

type ActionStickerProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  // Which accent this action owns. Fixed per action rather than per post, so
  // "like" is the same colour on every card and you learn the row by colour
  // as much as by glyph.
  accentIndex: number;
  active?: boolean;
  count?: number;
  onPress: () => void;
  accessibilityLabel: string;
};

// One action on a review — like, comment, share, save.
//
// No container. The first version put each glyph in a tilted, rimmed circle,
// which was wrong twice over: an Ionicons glyph does not sit on the centre
// of its own box (they carry uneven internal bearing), so centring the box
// left the mark visibly off-centre, and tilting the circle made that
// misalignment read as sloppy rather than as hand-placed. A tilt only works
// on something whose edge you can see is deliberately askew — a sticker or
// a stamp — and a plain circle is not that.
//
// So the mark itself carries the state instead: the accent when the action
// is on, quiet when it is off. Nothing to misalign, nothing competing with
// the rating stamp, which stays the loudest thing on the card.
const ICON_SIZE = 24;

export function ActionSticker({
  icon,
  accentIndex,
  active = false,
  count,
  onPress,
  accessibilityLabel,
}: ActionStickerProps) {
  const accent = StickerAccents[accentIndex % StickerAccents.length];

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Ionicons name={icon} size={ICON_SIZE} color={active ? accent : Colors.textSecondary} />
      {count != null && count > 0 && (
        <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
          {count}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.6,
  },
});
