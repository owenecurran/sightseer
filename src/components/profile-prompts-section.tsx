import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { PROFILE_PROMPTS } from '@/constants/profile-prompts';
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

  // useFocusEffect, not useEffect — this screen stays mounted while Edit
  // Profile is pushed on top, so a plain useEffect keyed on userId (which
  // never changes) would only ever fetch once and never pick up edits made
  // after returning from Edit Profile.
  useFocusEffect(
    useCallback(() => {
      listPrompts(userId).then(async (loaded) => {
        setPrompts(loaded);
        const photoAttachmentIds = loaded
          .flatMap((p) => p.attachments)
          .filter((a) => a.attachmentType === 'photo')
          .map((a) => a.id);
        if (photoAttachmentIds.length > 0) {
          setPhotoUrls(await getPromptPhotoUrls(photoAttachmentIds));
        } else {
          setPhotoUrls({});
        }
      });
    }, [userId])
  );

  if (prompts.length === 0) return null;

  return (
    <View style={styles.list}>
      {prompts.map((prompt) => (
        <ThemedView key={prompt.id} type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            {promptLabel(prompt.promptSlug)}
          </ThemedText>

          {prompt.attachments.map((attachment) => (
            <View key={attachment.id}>
              {attachment.attachmentType === 'text' && (
                <ThemedText type="default">{attachment.textValue}</ThemedText>
              )}

              {attachment.attachmentType === 'photo' && photoUrls[attachment.id] && (
                <Image source={{ uri: photoUrls[attachment.id] }} style={styles.photo} />
              )}

              {attachment.attachmentType === 'review' && (
                <Pressable
                  onPress={() =>
                    attachment.visitId &&
                    router.push({ pathname: '/visit/[id]', params: { id: attachment.visitId } })
                  }>
                  <ThemedText type="default">
                    {attachment.visitPlaceName ?? 'Unknown place'}
                    {attachment.visitRating != null ? ` · ${attachment.visitRating.toFixed(1)} ★` : ''}
                  </ThemedText>
                </Pressable>
              )}

              {attachment.attachmentType === 'board' && attachment.boardId && (
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/board/[id]', params: { id: attachment.boardId! } })
                  }>
                  <ThemedText type="link">{attachment.boardName ?? 'Board'}</ThemedText>
                </Pressable>
              )}
            </View>
          ))}
        </ThemedView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  photo: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: Spacing.two,
  },
});
