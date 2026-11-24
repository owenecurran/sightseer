import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { PaperPanel } from '@/components/ui/paper-panel';
import { RatingSliderWithPreview } from '@/components/ui/rating-slider-with-preview';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { pickImageFromLibrary } from '@/lib/image-picker';
import { uploadReviewPhotoAssets } from '@/lib/photo-upload';
import { getVisitForEdit, saveVisitEdit, type UploadedEditPhoto, type VisitForEdit } from '@/lib/visit-edit';
import { goBack } from '@/lib/navigation';
import { userErrorMessage } from '@/lib/user-error';
import { PHOTOS_NEEDED } from '@/lib/permissions';
import { ErrorNotice, FormError } from '@/components/ui/error-notice';

type NewPhoto = { kind: 'new'; uri: string; width: number; height: number };
type PhotoSlot = { kind: 'existing'; id: string; url: string } | NewPhoto;

type CropTarget = { uri: string; recropIndex: number | null };

export default function EditVisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  return <EditVisitForm key={`${userId}:${id}`} id={id} userId={userId} />;
}

function EditVisitForm({ id, userId }: { id?: string; userId?: string }) {
  const theme = useTheme();
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();

  const [visit, setVisit] = useState<VisitForEdit | null | undefined>(id && userId ? undefined : null);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [visitedOn, setVisitedOn] = useState('');
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // A failed load and a failed save are kept apart: the first replaces the
  // form, the second sits by its Save button.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadedPhotos = useRef(new WeakMap<NewPhoto, UploadedEditPhoto>());
  const saveInFlight = useRef(false);

  useEffect(() => {
    if (!id || !userId) return;
    let active = true;
    getVisitForEdit(id, userId)
      .then((result) => {
        if (!active) return;
        setVisit(result);
        if (!result) return;
        setRating(result.rating);
        setNote(result.note ?? '');
        setVisitedOn(result.visitedOn);
        setPhotoSlots(result.photos.map((p) => ({ kind: 'existing', id: p.id, url: p.url })));
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(userErrorMessage(err, 'Could not load that review.'));
        setVisit(null);
      });
    return () => { active = false; };
  }, [id, userId]);

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
      setError(PHOTOS_NEEDED);
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
    const newSlot: NewPhoto = { kind: 'new', uri: result.uri, width: result.width, height: result.height };

    if (recropIndex == null) {
      setPhotoSlots((prev) => [...prev, newSlot]);
      return;
    }
    const target = photoSlots[recropIndex];
    if (!target) return;
    if (target.kind === 'existing') setDeletedPhotoIds((ids) => [...ids, target.id]);
    setPhotoSlots((prev) => prev.map((slot, i) => (i === recropIndex ? newSlot : slot)));
  }

  async function handleSave() {
    if (!userId || !visit || saveInFlight.current) return;
    saveInFlight.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const newPhotos: UploadedEditPhoto[] = [];
      for (const slot of photoSlots) {
        if (slot.kind !== 'new') continue;
        const photo = uploadedPhotos.current.get(slot) ?? await uploadReviewPhotoAssets(
          { visitId: visit.id }, { ...slot, mimeType: 'image/jpeg' },
        );
        uploadedPhotos.current.set(slot, photo);
        newPhotos.push(photo);
      }
      await saveVisitEdit({
        visitId: visit.id,
        rating,
        note: note.trim() || null,
        visitedOn,
        removedPhotoIds: deletedPhotoIds,
        newPhotos,
      });

      goBack();
    } catch (err) {
      setError(userErrorMessage(err, 'Could not save your changes.'));
    } finally {
      saveInFlight.current = false;
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

          {visit === null && !loadError && (
            <ThemedText type="caption">
              This review isn’t available to edit.
            </ThemedText>
          )}

          {loadError && <ErrorNotice message={loadError} />}

          {visit && (
            <View style={styles.form}>
              {/* Same two-panel split as review-form: the score is its own
                  decision, everything else is the write-up around it. */}
              <PaperPanel seed="edit-rating" accentIndex={1}>
                <ThemedText type="sectionLabel">{visit.placeName}</ThemedText>
                <RatingSliderWithPreview value={rating} onChange={setRating} />
              </PaperPanel>

              <PaperPanel seed="edit-details" accentIndex={0}>
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
                <ThemedText type="caption">
                  Tap a photo to recrop it.
                </ThemedText>
              </View>

              <TextField placeholder="Review (optional)" value={note} onChangeText={setNote} multiline />
              <DateCarousel value={visitedOn} onChange={setVisitedOn} />
              </PaperPanel>

              {/* By the button, where the press was: at the top of the form
                  a failed save showed up off screen. */}
              {error && <FormError message={error} />}

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
    // Panel-to-panel spacing now, not field-to-field.
    gap: Spacing.three,
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
