import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InkBlot } from '@/components/ui/ink-blot';
import { StickerArrow } from '@/components/ui/sticker-arrow';
import { TicketCard } from '@/components/ui/ticket-card';
import { StickerAccents } from '@/constants/theme';

type ChoiceCardProps = {
  title: string;
  description: string;
  // Stable per option, so a given card keeps its colour, tilt and wear
  // instead of reshuffling every time the tab is focused.
  seed: string;
  // Which accent this card takes. Given explicitly rather than hashed from
  // the seed: hashing four seeds into six accents collides, and it did —
  // "New review" and "New board" both landed on amber. On a fixed list this
  // short, four distinct colours is a design decision, not something worth
  // leaving to a hash.
  accentIndex: number;
  onPress: () => void;
  // 'navigate' cards go somewhere and carry the sticker arrow. 'select'
  // cards are a radio or a toggle and carry a tick instead — an arrow on a
  // control that stays put is a promise the card does not keep.
  mode?: 'navigate' | 'select';
  selected?: boolean;
  // Sub-options nested under a branch (see review-source). Smaller title, so
  // the tree reads as a tree rather than as more top-level choices.
  compact?: boolean;
};

// A choice in a creation flow, as an object rather than a box.
//
// Shared by the create chooser, "New review"'s source picker and a board's
// ranking picker — all three were the same copy-pasted `optionCard` style:
// identical flat rectangles, the one corner of the app where nothing looked
// hand-placed.
//
// The ticket itself now lives in TicketCard, because the lists that a
// creation flow produces — a board's contents, a travel book's entries, the
// index of boards — draw the same object. What is left here is only what
// makes a ticket a CHOICE: a title, a description, and a stub that either
// points somewhere or records that this one was picked.
export function ChoiceCard({
  title,
  description,
  seed,
  accentIndex,
  onPress,
  mode = 'navigate',
  selected = false,
  compact = false,
}: ChoiceCardProps) {
  const accent = StickerAccents[accentIndex % StickerAccents.length];

  return (
    <TicketCard
      seed={seed}
      accentIndex={accentIndex}
      onPress={onPress}
      selected={selected}
      compact={compact}
      stub={
        mode === 'navigate' ? (
          <StickerArrow direction="right" size={compact ? 20 : 26} seed={`choice:${seed}`} />
        ) : (
          // Always drawn, stamped only when chosen. An empty stub reads as a
          // tear line leading to nothing — the ring is what tells you this
          // card is a choice you have not made yet rather than a decoration.
          <View style={[styles.ring, selected && { borderColor: accent }]}>
            {selected && <InkBlot size={15} seed={`choice-ink:${seed}`} color={accent} />}
          </View>
        )
      }>
      <ThemedText
        type={compact ? 'smallBold' : 'headline'}
        style={[styles.title, compact && styles.titleCompact]}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {description}
      </ThemedText>
    </TicketCard>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(234,231,207,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    // Metrics live on the `headlineWrapped` type now — see themed-text.tsx.
    flexShrink: 1,
  },
  titleCompact: {
    // The compact title uses `smallBold`, which already carries sane
    // metrics — the 34px headline override must not leak onto it.
    lineHeight: undefined,
  },
});
