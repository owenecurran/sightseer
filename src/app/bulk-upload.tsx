import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_VISIT_PHOTOS } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { createDraft, uploadPhotoForDraft } from '@/lib/drafts';
import { findNearbyPlaces } from '@/lib/google-places';
import { pickMultipleImagesFromLibrary } from '@/lib/image-picker';
import {
  clusterPhotosByLocation,
  earliestTakenOn,
  extractDateFromExif,
  extractGpsFromExif,
  type GeoTaggedAsset,
} from '@/lib/photo-clustering';
import { cachePlaceHierarchy } from '@/lib/places-cache';

// Local date, not toISOString() — same reasoning as review-form.tsx's own
// todayIsoDate() (UTC rolls over to "tomorrow" in the evening for any
// timezone behind UTC). Duplicated rather than shared, matching this
// codebase's existing convention for small screen-local helpers (e.g.
// comments-section.tsx's relativeTime).
function todayIsoDate(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function BulkUploadScreen() {
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChoosePhotos() {
    if (!session) return;
    setError(null);
    const result = await pickMultipleImagesFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required.');
      return;
    }
    if (!result) return;

    setIsProcessing(true);
    const assets: GeoTaggedAsset[] = result.map((asset) => {
      const exif = asset.exif as Record<string, unknown> | null | undefined;
      const gps = extractGpsFromExif(exif);
      return {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType,
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
        takenOn: extractDateFromExif(exif),
      };
    });
    const clusters = clusterPhotosByLocation(assets);
    setProgress({ done: 0, total: clusters.length });

    let failedPhotoCount = 0;
    let cappedPhotoCount = 0;

    for (const [index, cluster] of clusters.entries()) {
      try {
        let placeId: string | null = null;
        if (cluster.lat != null && cluster.lng != null) {
          try {
            const candidates = await findNearbyPlaces(cluster.lat, cluster.lng);
            if (candidates.length > 0) {
              const cached = await cachePlaceHierarchy(candidates[0]);
              placeId = cached.id;
            }
          } catch {
            // Best-effort — a failed place lookup just means this draft
            // starts with "Needs a location" instead of blocking the batch.
          }
        }

        // Earliest EXIF date among the cluster's own photos — when the
        // visit actually happened, not when it's being bulk-uploaded (often
        // much later, e.g. importing an old trip's photos in one go).
        // Falls back to today only when none of the cluster's photos have a
        // usable EXIF date at all.
        const visitedOn = earliestTakenOn(cluster.photos) ?? todayIsoDate();
        const draft = await createDraft({ userId: session.user.id, placeId, visitedOn });

        const photosToUpload = cluster.photos.slice(0, MAX_VISIT_PHOTOS);
        cappedPhotoCount += cluster.photos.length - photosToUpload.length;

        for (const [position, photo] of photosToUpload.entries()) {
          try {
            await uploadPhotoForDraft({
              draftId: draft.id,
              uri: photo.uri,
              mimeType: photo.mimeType,
              width: photo.width,
              height: photo.height,
              position,
            });
          } catch {
            failedPhotoCount += 1;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create some drafts.');
      }
      setProgress({ done: index + 1, total: clusters.length });
    }

    setIsProcessing(false);
    if (failedPhotoCount > 0 || cappedPhotoCount > 0) {
      const parts: string[] = [];
      if (failedPhotoCount > 0) parts.push(`${failedPhotoCount} photo${failedPhotoCount === 1 ? '' : 's'} failed to upload`);
      if (cappedPhotoCount > 0) parts.push(`${cappedPhotoCount} photo${cappedPhotoCount === 1 ? '' : 's'} skipped (max ${MAX_VISIT_PHOTOS} per draft)`);
      setError(`Drafts created, but ${parts.join(' and ')} — you can add more from each draft.`);
    }
    router.replace('/drafts');
  }

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

          <ThemedText type="displaySerif">Bulk upload</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Pick a batch of photos and we'll group them by location into starting drafts — one per place,
            ready for you to finish and publish.
          </ThemedText>

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          {progress && (
            <ThemedText type="small" themeColor="textSecondary">
              Creating draft {Math.min(progress.done + 1, progress.total)} of {progress.total}…
            </ThemedText>
          )}

          <Button label="Choose photos" onPress={handleChoosePhotos} loading={isProcessing} />
        </Animated.ScrollView>
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
});
