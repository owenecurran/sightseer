import { Pressable, StyleSheet, View } from 'react-native';

import { StickerArrow } from '@/components/ui/sticker-arrow';
import { ThemedText } from '@/components/themed-text';
import { LoadableImage } from '@/components/ui/loadable-image';
import { StretchText } from '@/components/ui/stretch-text';
import { CARD_PADDING, CARD_RADIUS, TIGHT_GAP, TITLE_FONT_SIZE } from '@/components/ui/teaser-card';
import { Spacing } from '@/constants/theme';

type GridPromptCardProps = {
  label: string;
  title: string;
  photoIds: string[];
  photoUrls: Record<string, string>;
  onPress: () => void;
};

// 'board'/'travel_book' in 'grid' mode — the only prompt card that can't
// use the shared TeaserCard as-is (that's built around exactly one square
// photo beside the title; a grid of up to 4 needs its own photo layout),
// so it reuses TeaserCard's own style tokens directly to still read as the
// same family of card. Shared by profile-prompts-section.tsx (the real
// rendered card) and the prompt editor's live preview (attachment-preview.tsx).
export function GridPromptCard({ label, title, photoIds, photoUrls, onPress }: GridPromptCardProps) {
  const withUrls = photoIds.filter((id) => photoUrls[id]);
  return (
    <Pressable onPress={onPress} style={styles.gridCard}>
      <ThemedText type="sectionLabel">{label}</ThemedText>
      {withUrls.length > 0 && (
        <View style={styles.gridContainer}>
          {withUrls.map((id) => (
            <LoadableImage key={id} source={{ uri: photoUrls[id] }} style={styles.gridPhoto} contentFit="cover" />
          ))}
        </View>
      )}
      <View style={styles.gridTitleRow}>
        <View style={styles.gridTitle}>
          <StretchText type="headline" fill style={styles.titleText}>
            {title}
          </StretchText>
        </View>
        <StickerArrow direction="right" seed="grid-prompt" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gridCard: {
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.35)',
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    gap: TIGHT_GAP,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TIGHT_GAP,
  },
  gridPhoto: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: Spacing.one,
  },
  gridTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  gridTitle: {
    flex: 1,
  },
  titleText: {
    fontSize: TITLE_FONT_SIZE,
  },
});
