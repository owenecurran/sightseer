import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
import { MAX_VISIT_PHOTOS } from '@/components/photo-grid';
import { PhotoCropModal, type CroppedPhoto } from '@/components/photo-crop-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { DateCarousel } from '@/components/ui/date-carousel';
import { PageLoader } from '@/components/ui/page-loader';
import { RatingSliderWithPreview } from '@/components/ui/rating-slider-with-preview';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { pickImageFromLibrary } from '@/lib/image-picker';
import { uploadPhotoForVisit } from '@/lib/photo-upload';
import { deleteVisitPhoto, getVisitForEdit, updateVisitFields, type VisitForEdit } from '@/lib/visit-edit';
import { goBack } from '@/lib/navigation';

type PhotoSlot =
  | { kind: 'existing'; id: string; url: string; position: number }
  | { kind: 'new'; uri: string; width: number; height: number };

type CropTarget = { uri: string; recropIndex: number | null };

export default function EditVisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const theme = useTheme();
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();

  const [visit, setVisit] = useState<VisitForEdit | null | undefined>(undefined);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [visitedOn, setVisitedOn] = useState('');
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !session) return;
    getVisitForEdit(id, session.user.id)
      .then((result) => {
        setVisit(result);
        if (!result) return;
        setRating(result.rating);
        setNote(result.note ?? '');
        setVisitedOn(result.visitedOn);
        setPhotoSlots(result.photos.map((p) => ({ kind: 'existing', id: p.id, url: p.url, position: p.position })));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load that review.'));
  }, [id, session]);

  function handleRemoveSlot(index: number) {
    const slot = photoSlots[index];
    if (slot.kind === 'existing') setDeletedPhotoIds((prev) => [...prev, slot.id]);
    setPhotoSlots((prev) => prev.filter((_, i) => i !== index));
  }

  function handleRecropSlot(index: number) {
    const slot = photoSlots[index];
    setCropTarget({ uri: slot.kind === 'existing' ? slot.url : slot.uri, recropIndex: index });
  }

  async function handleAddPhoto() {
    if (photoSlots.length >= MAX_VISIT_PHOTOS) return;
    setError(null);
    const result = await pickImageFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required to add photos.');
      return;
    }
    if (result) setCropTarget({ uri: result.uri, recropIndex: null });
  }

  function handleCropCancel() {
    setCropTarget(null);
  }

  function handleCropConfirm(result: CroppedPhoto) {
    const recropIndex = cropTarget?.recropIndex ?? null;
    setCropTarget(null);
    const newSlot: PhotoSlot = { kind: 'new', uri: result.uri, width: result.width, height: result.height };

    if (recropIndex == null) {
      setPhotoSlots((prev) => [...prev, newSlot]);
      return;
    }
    setPhotoSlots((prev) => {
      const target = prev[recropIndex];
      if (target.kind === 'existing') setDeletedPhotoIds((ids) => [...ids, target.id]);
      return prev.map((slot, i) => (i === recropIndex ? newSlot : slot));
    });
  }

  async function handleSave() {
    if (!session || !visit) return;
    setError(null);
    setIsSaving(true);
    try {
      await updateVisitFields(visit.id, { rating, note: note.trim() || null, visitedOn });

      for (const photoId of deletedPhotoIds) {
        await deleteVisitPhoto(photoId);
      }

      // New photos are appended after every kept existing photo's own
      // position — positions never need compacting for correct order, only
      // to stay higher than whatever's already there (see visit-edit.ts).
      const maxExistingPosition = photoSlots.reduce(
        (max, slot) => (slot.kind === 'existing' ? Math.max(max, slot.position) : max),
        -1
      );
      let nextPosition = maxExistingPosition + 1;
      for (const slot of photoSlots) {
        if (slot.kind !== 'new') continue;
        await uploadPhotoForVisit({
          visitId: visit.id,
          uri: slot.uri,
          mimeType: 'image/jpeg',
          width: slot.width,
          height: slot.height,
          position: nextPosition,
        });
        nextPosition += 1;
      }

      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your changes.');
    } finally {
      setIsSaving(false);
    }
  }

  if (visit === undefined) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAwareScroll
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <BackLink seed="[id]" />

          <ThemedText type="displaySerif">Edit review</ThemedText>

          {visit === null && (
            <ThemedText type="small" themeColor="textSecondary">
              This review isn’t available to edit.
            </ThemedText>
          )}

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          {visit && (
            <View style={styles.form}>
              <ThemedText type="smallBold">{visit.placeName}</ThemedText>

              <RatingSliderWithPreview value={rating} onChange={setRating} />

              <View style={styles.photoSection}>
                {photoSlots.length > 0 && (
                  <View style={styles.photoRow}>
                    {photoSlots.map((slot, index) => (
                      <Pressable
                        key={slot.kind === 'existing' ? slot.id : slot.uri}
                        onPress={() => handleRecropSlot(index)}
                        style={styles.photoTile}>
                        <Image source={{ uri: slot.kind === 'existing' ? slot.url : slot.uri }} style={styles.photoThumbnail} />
                        <Pressable
                          onPress={() => handleRemoveSlot(index)}
                          hitSlop={8}
                          style={[styles.removeBadge, { backgroundColor: theme.background }]}>
                          <Ionicons name="close" size={14} color={theme.text} />
                        </Pressable>
                      </Pressable>
                    ))}
                  </View>
                )}
                {photoSlots.length < MAX_VISIT_PHOTOS && (
                  <Button
                    label={`Add photo (${photoSlots.length}/${MAX_VISIT_PHOTOS})`}
                    variant="secondary"
                    onPress={handleAddPhoto}
                  />
                )}
                <ThemedText type="small" themeColor="textSecondary">
                  Tap a photo to recrop it.
                </ThemedText>
              </View>

              <TextField placeholder="Review (optional)" value={note} onChangeText={setNote} multiline />
              <DateCarousel value={visitedOn} onChange={setVisitedOn} />

              <Button label="Save changes" onPress={handleSave} loading={isSaving} />
            </View>
          )}
        </KeyboardAwareScroll>

        <PhotoCropModal
          visible={cropTarget != null}
          uri={cropTarget?.uri ?? null}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
          allowRatioSelection
        />
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  form: {
    gap: Spacing.two,
  },
  photoSection: {
    gap: Spacing.two,
  },
  photoRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  photoTile: {
    width: 64,
    height: 64,
  },
  photoThumbnail: {
    width: 64,
    height: 64,
    borderRadius: Spacing.two,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
