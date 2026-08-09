import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ReviewPromptCard } from '@/components/review-prompt-card';
import { ThemedText } from '@/components/themed-text';
import { GridPromptCard } from '@/components/ui/grid-prompt-card';
import { StretchText } from '@/components/ui/stretch-text';
import { CARD_PADDING, CARD_PADDING_LEFT, CARD_RADIUS, TeaserCard, TIGHT_GAP, TITLE_FONT_SIZE } from '@/components/ui/teaser-card';
import { Spacing } from '@/constants/theme';

// What the prompt editor's live preview actually needs to render one
// attachment — resolved by prompt-editor.tsx from its own in-progress
// LocalAttachment plus whichever photo-option lookup applies, rather than
// this component reaching into that editor-only state itself. Mirrors the
// exact same attachment-type switch profile-prompts-section.tsx uses for
// the real, saved rendering, so a preview never drifts from what actually
// ends up on the profile.
export type PreviewData =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'photo'; url?: string }
  | { kind: 'review'; visitId: string; placeName: string; rating: number | null; note: string | null; photoUrl?: string }
  | { kind: 'cover'; title: string; thumbnailUrl?: string }
  | { kind: 'grid'; title: string; photoIds: string[]; photoUrls: Record<string, string> };

type AttachmentPreviewProps = {
  label: string;
  data: PreviewData;
};

const noop = () => {};

// Live "what this will look like on the page" preview inside the prompt
// editor — reuses the exact same card components profile-prompts-section.tsx
// renders for real (ReviewPromptCard/TeaserCard/GridPromptCard), just fed
// from in-progress editor state instead of a saved attachment, and never
// navigates on tap (onPress: noop / ReviewPromptCard's own `disabled`).
export function AttachmentPreview({ label, data }: AttachmentPreviewProps) {
  if (data.kind === 'empty') {
    return (
      <View style={styles.emptyBox}>
        <ThemedText type="small" themeColor="textSecondary">
          Preview will appear here once you finish this attachment.
        </ThemedText>
      </View>
    );
  }

  if (data.kind === 'text') {
    return (
      <View style={styles.borderedBox}>
        <ThemedText type="sectionLabel">{label}</ThemedText>
        <StretchText type="headline" fill style={styles.titleText}>
          {data.text}
        </StretchText>
      </View>
    );
  }

  if (data.kind === 'photo') {
    return (
      <View style={styles.borderedBox}>
        <ThemedText type="sectionLabel">{label}</ThemedText>
        {data.url ? (
          <Image source={{ uri: data.url }} style={styles.photo} contentFit="contain" />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]} />
        )}
      </View>
    );
  }

  if (data.kind === 'review') {
    return (
      <ReviewPromptCard
        label={label}
        visitId={data.visitId}
        placeName={data.placeName}
        rating={data.rating}
        note={data.note}
        photoUrl={data.photoUrl}
        disabled
      />
    );
  }

  if (data.kind === 'grid') {
    return <GridPromptCard label={label} title={data.title} photoIds={data.photoIds} photoUrls={data.photoUrls} onPress={noop} />;
  }

  return <TeaserCard label={label} title={data.title} thumbnailUrl={data.thumbnailUrl} onPress={noop} />;
}

const styles = StyleSheet.create({
  emptyBox: {
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.2)',
    borderStyle: 'dashed',
    borderRadius: CARD_RADIUS,
    padding: Spacing.three,
    alignItems: 'center',
  },
  borderedBox: {
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.35)',
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    paddingLeft: CARD_PADDING_LEFT,
    gap: TIGHT_GAP,
  },
  titleText: {
    fontSize: TITLE_FONT_SIZE,
  },
  photo: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: Spacing.one,
  },
  photoPlaceholder: {
    backgroundColor: 'rgba(234,231,207,0.08)',
  },
});
