import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { MAX_VISIT_PHOTOS } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/error-notice';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { createDraft, uploadPhotoForDraft } from '@/lib/drafts';
import { findNearbyPlaces } from '@/lib/google-places';
import { pickMultipleImagesFromLibrary } from '@/lib/image-picker';
import {
  clusterAllTogether,
  clusterOnePerPhoto,
  clusterPhotosByLocation,
  earliestTakenOn,
  extractDateFromExif,
  extractGpsFromExif,
  type GeoTaggedAsset,
} from '@/lib/photo-clustering';
import { cachePlaceHierarchy } from '@/lib/places-cache';
import { userErrorMessage } from '@/lib/user-error';
import { PHOTOS_NEEDED } from '@/lib/permissions';

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

// How the picked photos get split into drafts. Set by review-source.tsx's
// own second-level choice; anything unrecognised (an old deep link, say)
// falls back to the automatic by-place grouping this screen shipped with.
type PhotoMode = 'per-photo' | 'single' | 'by-place';

const MODE_COPY: Record<PhotoMode, { title: string; blurb: string }> = {
  'per-photo': {
    title: 'One review per photo',
    blurb:
      "Pick your photos and each one becomes its own draft, using its own location and date from the photo's metadata. Pick just one photo to make a single review.",
  },
  single: {
    title: 'One review for all photos',
    blurb:
      'Pick your photos and they all go on one draft, using the first photo that carries a location.',
  },
  'by-place': {
    title: 'Bulk upload',
    blurb:
      "Pick a batch of photos and we'll group them by location into starting drafts, one per place, ready for you to finish and publish.",
  },
};

export default function BulkUploadScreen() {
  const { mode: rawMode } = useLocalSearchParams<{ mode?: string }>();
  const mode: PhotoMode =
    rawMode === 'per-photo' || rawMode === 'single' ? rawMode : 'by-place';
  const copy = MODE_COPY[mode];
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Some drafts were made but not everything went: offer the way to them.
  const [hasDrafts, setHasDrafts] = useState(false);

  async function handleChoosePhotos() {
    if (!session) return;
    setError(null);
    setHasDrafts(false);
    const result = await pickMultipleImagesFromLibrary();
    if (result === 'denied') {
      setError(PHOTOS_NEEDED);
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
    const clusters =
      mode === 'per-photo'
        ? clusterOnePerPhoto(assets)
        : mode === 'single'
          ? clusterAllTogether(assets)
          : clusterPhotosByLocation(assets);
    setProgress({ done: 0, total: clusters.length });

    let failedPhotoCount = 0;
    let cappedPhotoCount = 0;
    let createdCount = 0;
    let lastDraftError: unknown = null;

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
        createdCount += 1;

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
        lastDraftError = err;
      }
      setProgress({ done: index + 1, total: clusters.length });
    }

    setIsProcessing(false);
    setProgress(null);

    // Every one of these used to be set and then left behind at once, by
    // going straight to Drafts: nobody saw them. When nothing could be made
    // at all (no connection, say) that landed on an empty Drafts screen with
    // no word of why. Now this screen stays up whenever there is something
    // to say, and only goes on by itself when everything worked.
    if (createdCount === 0) {
      setError(userErrorMessage(lastDraftError, 'Could not create those drafts. Try again.'));
      return;
    }
    const parts: string[] = [];
    const notMade = clusters.length - createdCount;
    if (notMade > 0) parts.push(`${notMade} draft${notMade === 1 ? '' : 's'} could not be made`);
    if (failedPhotoCount > 0) parts.push(`${failedPhotoCount} photo${failedPhotoCount === 1 ? '' : 's'} failed to upload`);
    if (cappedPhotoCount > 0) parts.push(`${cappedPhotoCount} photo${cappedPhotoCount === 1 ? '' : 's'} skipped (max ${MAX_VISIT_PHOTOS} per draft)`);
    if (parts.length > 0) {
      setError(`Drafts created, but ${parts.join(' and ')}. You can add more from each draft.`);
      setHasDrafts(true);
      return;
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
          <BackLink seed="bulk-upload" />

          <ThemedText type="displaySerif">{copy.title}</ThemedText>
          <ThemedText type="caption">
            {copy.blurb}
          </ThemedText>

          {error && <FormError message={error} />}

          {progress && (
            <ThemedText type="meta">
              Creating draft {Math.min(progress.done + 1, progress.total)} of {progress.total}…
            </ThemedText>
          )}

          {hasDrafts && <Button label="See your drafts" onPress={() => router.replace('/drafts')} />}

          <Button
            label="Choose photos"
            variant={hasDrafts ? 'secondary' : 'primary'}
            onPress={handleChoosePhotos}
            loading={isProcessing}
          />
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
