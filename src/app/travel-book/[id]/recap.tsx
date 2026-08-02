import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoCropModal, type CroppedPhoto } from '@/components/photo-crop-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { RatingSlider } from '@/components/ui/rating-slider';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { pickImageFromLibrary } from '@/lib/image-picker';
import {
  getRecap,
  getRecapCoverUrls,
  publishRecap,
  unpublishRecap,
  uploadRecapCover,
  upsertRecapDraft,
  type TravelBookRecapRow,
} from '@/lib/travel-book-recaps';

export default function TravelBookRecapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [recap, setRecap] = useState<TravelBookRecapRow | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [rating, setRating] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setError(null);
      (async () => {
        try {
          const existing = await getRecap(id);
          setRecap(existing);
          if (existing) {
            setTitle(existing.title);
            setBody(existing.body ?? '');
            setRating(existing.rating ?? 8);
            if (existing.cover_r2_key) {
              const urls = await getRecapCoverUrls([existing.id]);
              setCoverUrl(urls[existing.id] ?? null);
            }
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load this recap.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [id])
  );

  async function handleSaveDraft() {
    if (!session || !id || !title.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      const saved = await upsertRecapDraft({
        bookId: id,
        authorId: session.user.id,
        title: title.trim(),
        body: body.trim(),
        rating,
      });
      setRecap(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this recap.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTogglePublish() {
    if (!recap) return;
    setError(null);
    setIsSaving(true);
    try {
      if (recap.is_published) {
        await unpublishRecap(recap.id);
      } else {
        await publishRecap(recap.id);
      }
      setRecap({ ...recap, is_published: !recap.is_published });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update publish status.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePickCover() {
    const result = await pickImageFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required to set a cover photo.');
      return;
    }
    if (result) setCropSource(result.uri);
  }

  async function handleCropConfirm(cropped: CroppedPhoto) {
    setCropSource(null);
    if (!recap) {
      setError('Save the recap as a draft first, then add a cover photo.');
      return;
    }
    setIsUploadingCover(true);
    try {
      await uploadRecapCover({ recapId: recap.id, uri: cropped.uri, mimeType: 'image/jpeg' });
      setCoverUrl(cropped.uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setIsUploadingCover(false);
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>

          <ThemedText type="displaySerif">Trip recap</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            A write-up about the whole trip — separate from the individual place reviews inside it. Publishing
            it puts it on your feed.
          </ThemedText>

          {coverUrl && <Image source={{ uri: coverUrl }} style={styles.cover} />}
          <Button
            label={coverUrl ? 'Change cover photo' : 'Add cover photo'}
            variant="secondary"
            onPress={handlePickCover}
            loading={isUploadingCover}
          />

          <TextField placeholder="Recap title" value={title} onChangeText={setTitle} />
          <TextField placeholder="How was the trip?" value={body} onChangeText={setBody} multiline />
          <RatingSlider value={rating} onChange={setRating} />

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <Button label="Save draft" onPress={handleSaveDraft} loading={isSaving} disabled={!title.trim()} />
          {recap && (
            <Button
              label={recap.is_published ? 'Unpublish' : 'Publish to feed'}
              variant="secondary"
              onPress={handleTogglePublish}
              loading={isSaving}
            />
          )}
        </Animated.ScrollView>

        <PhotoCropModal visible={cropSource != null} uri={cropSource} onCancel={() => setCropSource(null)} onConfirm={handleCropConfirm} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  cover: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Spacing.three,
  },
});
