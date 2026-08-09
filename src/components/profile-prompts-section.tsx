import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ReviewPromptCard } from '@/components/review-prompt-card';
import { ThemedText } from '@/components/themed-text';
import { GridPromptCard } from '@/components/ui/grid-prompt-card';
import { LoadableImage } from '@/components/ui/loadable-image';
import { StretchText } from '@/components/ui/stretch-text';
import { CARD_PADDING, CARD_PADDING_LEFT, CARD_RADIUS, TeaserCard, TIGHT_GAP, TITLE_FONT_SIZE } from '@/components/ui/teaser-card';
import { Spacing } from '@/constants/theme';
import { PROFILE_PROMPTS } from '@/constants/profile-prompts';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { getPromptPhotoUrls, listPrompts, type ProfilePrompt } from '@/lib/profile-prompts';

function promptLabel(slug: string): string {
  return PROFILE_PROMPTS.find((p) => p.slug === slug)?.label ?? slug;
}

type ProfilePromptsSectionProps = {
  userId: string;
};

export function ProfilePromptsSection({ userId }: ProfilePromptsSectionProps) {
  const [prompts, setPrompts] = useState<ProfilePrompt[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [visitPhotoUrls, setVisitPhotoUrls] = useState<Record<string, string>>({});
  const [coverPhotoUrls, setCoverPhotoUrls] = useState<Record<string, string>>({});

  // useFocusEffect, not useEffect — this screen stays mounted while Edit
  // Profile is pushed on top, so a plain useEffect keyed on userId (which
  // never changes) would only ever fetch once and never pick up edits made
  // after returning from Edit Profile.
  useFocusEffect(
    useCallback(() => {
      listPrompts(userId).then(async (loaded) => {
        setPrompts(loaded);
        const attachments = loaded.flatMap((p) => p.attachments);

        // 'photo' attachments always have one.
        const photoAttachmentIds = attachments.filter((a) => a.photoR2Key != null).map((a) => a.id);
        setPhotoUrls(photoAttachmentIds.length > 0 ? await getPromptPhotoUrls(photoAttachmentIds) : {});

        const visitPhotoIds = attachments
          .filter((a) => a.attachmentType === 'review' && a.visitPhotoId)
          .map((a) => a.visitPhotoId!);
        setVisitPhotoUrls(visitPhotoIds.length > 0 ? await getPhotoViewUrls(visitPhotoIds) : {});

        // 'place'/'board'/'travel_book' cover/grid photos — see
        // 20260808110000_prompt_cover_photos.sql.
        const coverIds = attachments.flatMap((a) =>
          [a.coverPhotoId, ...a.gridPhotoIds].filter((id): id is string => id != null)
        );
        setCoverPhotoUrls(coverIds.length > 0 ? await getPhotoViewUrls(coverIds) : {});
      });
    }, [userId])
  );

  if (prompts.length === 0) return null;

  return (
    <View style={styles.list}>
      {prompts.map((prompt) => (
        <View key={prompt.id} style={styles.promptGroup}>
          {prompt.attachments.map((attachment) => {
            if (attachment.attachmentType === 'text' && attachment.textValue) {
              return (
                <View key={attachment.id} style={styles.borderedBox}>
                  <ThemedText type="sectionLabel">{promptLabel(prompt.promptSlug)}</ThemedText>
                  <StretchText type="headline" fill style={styles.titleText}>
                    {attachment.textValue}
                  </StretchText>
                </View>
              );
            }

            if (attachment.attachmentType === 'photo') {
              return (
                <View key={attachment.id} style={styles.borderedBox}>
                  <ThemedText type="sectionLabel">{promptLabel(prompt.promptSlug)}</ThemedText>
                  <LoadableImage
                    source={photoUrls[attachment.id] ? { uri: photoUrls[attachment.id] } : undefined}
                    style={styles.photo}
                    contentFit="contain"
                  />
                </View>
              );
            }

            if (attachment.attachmentType === 'review' && attachment.visitId) {
              return (
                <ReviewPromptCard
                  key={attachment.id}
                  label={promptLabel(prompt.promptSlug)}
                  visitId={attachment.visitId}
                  placeName={attachment.visitPlaceName ?? 'Unknown place'}
                  rating={attachment.visitRating}
                  note={attachment.visitNote}
                  photoUrl={attachment.visitPhotoId ? visitPhotoUrls[attachment.visitPhotoId] : undefined}
                />
              );
            }

            if (attachment.attachmentType === 'board' && attachment.boardId) {
              const onPress = () => router.push({ pathname: '/board/[id]', params: { id: attachment.boardId! } });
              if (attachment.displayMode === 'grid' && attachment.gridPhotoIds.length > 0) {
                return (
                  <GridPromptCard
                    key={attachment.id}
                    label={promptLabel(prompt.promptSlug)}
                    title={attachment.boardName ?? 'Board'}
                    photoIds={attachment.gridPhotoIds}
                    photoUrls={coverPhotoUrls}
                    onPress={onPress}
                  />
                );
              }
              return (
                <TeaserCard
                  key={attachment.id}
                  label={promptLabel(prompt.promptSlug)}
                  title={attachment.boardName ?? 'Board'}
                  thumbnailUrl={attachment.coverPhotoId ? coverPhotoUrls[attachment.coverPhotoId] : undefined}
                  onPress={onPress}
                />
              );
            }

            if (attachment.attachmentType === 'travel_book' && attachment.travelBookId) {
              const onPress = () =>
                router.push({ pathname: '/travel-book/[id]', params: { id: attachment.travelBookId! } });
              if (attachment.displayMode === 'grid' && attachment.gridPhotoIds.length > 0) {
                return (
                  <GridPromptCard
                    key={attachment.id}
                    label={promptLabel(prompt.promptSlug)}
                    title={attachment.travelBookName ?? 'Travel book'}
                    photoIds={attachment.gridPhotoIds}
                    photoUrls={coverPhotoUrls}
                    onPress={onPress}
                  />
                );
              }
              return (
                <TeaserCard
                  key={attachment.id}
                  label={promptLabel(prompt.promptSlug)}
                  title={attachment.travelBookName ?? 'Travel book'}
                  thumbnailUrl={attachment.coverPhotoId ? coverPhotoUrls[attachment.coverPhotoId] : undefined}
                  onPress={onPress}
                />
              );
            }

            if (attachment.attachmentType === 'place' && attachment.placeId) {
              return (
                <TeaserCard
                  key={attachment.id}
                  label={promptLabel(prompt.promptSlug)}
                  title={attachment.placeName ?? 'Unknown place'}
                  thumbnailUrl={attachment.coverPhotoId ? coverPhotoUrls[attachment.coverPhotoId] : undefined}
                  onPress={() => router.push({ pathname: '/place/[id]', params: { id: attachment.placeId! } })}
                />
              );
            }

            return null;
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.three,
  },
  promptGroup: {
    gap: Spacing.two,
  },
  // 'text'/'photo' only — neither navigates anywhere, so unlike the other
  // types here they don't get TeaserCard's chevron/image-row treatment,
  // just the same sharp corners/tight padding/larger stretched text.
  borderedBox: {
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.35)',
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    paddingLeft: CARD_PADDING_LEFT,
    gap: TIGHT_GAP,
  },
  photo: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: Spacing.one,
  },
  titleText: {
    fontSize: TITLE_FONT_SIZE,
  },
});
