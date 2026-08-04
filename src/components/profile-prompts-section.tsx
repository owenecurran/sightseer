import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ReviewPromptCard } from '@/components/review-prompt-card';
import { ThemedText } from '@/components/themed-text';
import { LoadableImage } from '@/components/ui/loadable-image';
import { StretchText } from '@/components/ui/stretch-text';
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

  // useFocusEffect, not useEffect — this screen stays mounted while Edit
  // Profile is pushed on top, so a plain useEffect keyed on userId (which
  // never changes) would only ever fetch once and never pick up edits made
  // after returning from Edit Profile.
  useFocusEffect(
    useCallback(() => {
      listPrompts(userId).then(async (loaded) => {
        setPrompts(loaded);
        const attachments = loaded.flatMap((p) => p.attachments);

        const photoAttachmentIds = attachments.filter((a) => a.attachmentType === 'photo').map((a) => a.id);
        setPhotoUrls(photoAttachmentIds.length > 0 ? await getPromptPhotoUrls(photoAttachmentIds) : {});

        const visitPhotoIds = attachments
          .filter((a) => a.attachmentType === 'review' && a.visitPhotoId)
          .map((a) => a.visitPhotoId!);
        setVisitPhotoUrls(visitPhotoIds.length > 0 ? await getPhotoViewUrls(visitPhotoIds) : {});
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
                  <StretchText type="headline" fill>{attachment.textValue}</StretchText>
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
              return (
                <Pressable
                  key={attachment.id}
                  onPress={() => router.push({ pathname: '/board/[id]', params: { id: attachment.boardId! } })}
                  style={styles.borderedBox}>
                  <ThemedText type="sectionLabel">{promptLabel(prompt.promptSlug)}</ThemedText>
                  <StretchText type="headline" fill>{attachment.boardName ?? 'Board'}</StretchText>
                </Pressable>
              );
            }

            if (attachment.attachmentType === 'place' && attachment.placeId) {
              return (
                <Pressable
                  key={attachment.id}
                  onPress={() => router.push({ pathname: '/place/[id]', params: { id: attachment.placeId! } })}
                  style={styles.borderedBox}>
                  <ThemedText type="sectionLabel">{promptLabel(prompt.promptSlug)}</ThemedText>
                  <StretchText type="headline" fill>{attachment.placeName ?? 'Unknown place'}</StretchText>
                </Pressable>
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
  borderedBox: {
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.35)',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  photo: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: Spacing.two,
  },
});
