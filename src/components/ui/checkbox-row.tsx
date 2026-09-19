import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InkBlot } from '@/components/ui/ink-blot';
import { BrandColors, Spacing, StickerAccents } from '@/constants/theme';

type CheckboxRowProps = {
  label: string;
  // Second line under the label, for a setting whose consequence is not
  // obvious from its name.
  description?: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  // Which accent the blot is stamped in. Defaults to the sage that reads as
  // "on" everywhere else; worth setting where several checkboxes sit
  // together and want telling apart.
  accentIndex?: number;
};

// A labelled checkbox. Lifted out of settings.tsx when the notification
// preferences moved to their own screen and both needed it.
//
// The mark is an ink blot rather than a '✓', matching how a choice is shown
// on the ticket cards — ink on paper, not a UI glyph. The box went round at
// the same time: a square box with a blot in it reads as a sticker that
// missed, where the ring is the same shape ChoiceCard uses to mean the same
// thing.
//
// The blot is seeded off the label, so each checkbox keeps one shape for
// life without every call site having to invent an id for it — two
// checkboxes only ever share a mark if they also share their wording.
export function CheckboxRow({
  label,
  description,
  checked,
  onPress,
  disabled,
  accentIndex = 0,
}: CheckboxRowProps) {
  const accent = StickerAccents[accentIndex % StickerAccents.length];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.pressed]}>
      <View style={[styles.box, checked && { borderColor: accent }]}>
        {checked && <InkBlot size={13} seed={`checkbox:${label}`} color={accent} />}
      </View>
      {/* Takes the slack so a long label wraps under itself rather than
          pushing the box off the row. */}
      <ThemedText type="small" style={styles.label}>
        {label}
        {description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {'\n'}
            {description}
          </ThemedText>
        ) : null}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    // The card behind these is backgroundElement, so an unchecked box needs
    // its own outline to read as a control rather than a hole.
    borderWidth: 2,
    borderColor: 'rgba(234,231,207,0.25)',
    // Keeps a blot's splatter inside the ring, so a row of these stays on
    // one baseline.
    overflow: 'hidden',
    backgroundColor: BrandColors.background,
  },
  label: {
    flex: 1,
  },
});
