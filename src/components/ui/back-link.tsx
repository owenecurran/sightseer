import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { StickerArrow } from '@/components/ui/sticker-arrow';
import { Spacing } from '@/constants/theme';
import { goBack } from '@/lib/navigation';

type BackLinkProps = {
  label?: string;
  onPress?: () => void;
  // Stable per screen, so a given screen's sticker keeps the same shape and
  // colour instead of reshuffling on every render. Screens pass their own
  // route name; the default is only for one-offs.
  seed?: string;
};

// The single back control for the whole app.
//
// Previously this exact Pressable-plus-"← Back" pair was hand-written in 34
// separate files, which meant restyling it — as the sticker treatment does —
// would have been 34 edits and 34 chances to drift. One component, one
// place to change.
export function BackLink({ label = 'Back', onPress, seed = 'back' }: BackLinkProps) {
  return (
    <Pressable
      onPress={onPress ?? goBack}
      hitSlop={8}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <StickerArrow direction="left" seed={seed} />
      <ThemedText type="link">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.6,
  },
});
