import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
import { LocationSearchModal } from '@/components/location-search-modal';
import { MAX_VISIT_PHOTOS } from '@/components/photo-grid';
import { PhotoCropModal, type CroppedPhoto } from '@/components/photo-crop-modal';
import { SaveToBoard } from '@/components/save-to-board';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { DateCarousel } from '@/components/ui/date-carousel';
import { RatingSlider } from '@/components/ui/rating-slider';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
import { deleteDraftPhoto, getDraftForEdit, publishDraft, updateDraftFields, uploadPhotoForDraft } from '@/lib/drafts';
import {
  autocompletePlaces,
  createPlacesSessionToken,
  fetchPlaceDetails,
  type PlaceAutocompleteSuggestion,
} from '@/lib/google-places';
import { pickImageFromLibrary } from '@/lib/image-picker';
import { cachePlaceHierarchy, getPlaceBreadcrumb } from '@/lib/places-cache';
import { uploadPhotoForVisit } from '@/lib/photo-upload';
import { searchUsers } from '@/lib/search';
import { supabase } from '@/lib/supabase';

// Mirrors edit-visit/[id].tsx's own PhotoSlot pattern — needed only for
// resuming a draft, which (unlike a fresh review) can arrive with photos
// already uploaded. The fresh-review path below keeps its original
// pendingPhotos/uploadedPhotoUris pair untouched.
type PhotoSlot =
  | { kind: 'existing'; id: string; url: string; position: number }
  | { kind: 'new'; uri: string; width: number; height: number };

type CropTarget =
  | { kind: 'pending' }
  | { kind: 'after-save' }
  | { kind: 'draft-new' }
  | { kind: 'draft-recrop'; index: number };

const DEBOUNCE_MS = 300;

type PlaceRow = Database['public']['Tables']['places']['Row'];
type UserRow = Database['public']['Tables']['users']['Row'];

// Local date, not toISOString() (which is UTC and rolls over to "tomorrow"
// in the evening for any timezone behind UTC).
function todayIsoDate(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function ReviewFormScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const { placeId, draftId } = useLocalSearchParams<{ placeId?: string; draftId?: string }>();
  const bottomInset = useBottomTabInset();
  const [error, setError] = useState<string | null>(null);
  // Arriving fresh (no placeId already picked, e.g. place/[id].tsx's "Add
  // your review") goes straight to the map instead of requiring an extra tap
  // on "Search for a place" first — that button/label still render as a
  // fallback (and a way to change the place later) once the picker's closed.
  // A draftId arrival doesn't auto-open either way — the draft-load effect
  // below decides, once it knows whether that draft already has a place.
  const [isPickerOpen, setIsPickerOpen] = useState(!placeId && !draftId);
  const scrollHandler = useHideOnScrollHandler();

  // Set once a draft has been loaded (or once one's been published this
  // session, back to null — see handleSaveVisit) — gates which photo model
  // and which button label render, and whether handlePlaceSelected resets
  // the rest of the form.
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId ?? null);
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);

  const [selectedPlace, setSelectedPlace] = useState<PlaceRow | null>(null);
  const [breadcrumb, setBreadcrumb] = useState('');
  // null = no score set yet — see rating-slider.tsx's own comment. Replaces
  // the earlier separate "add without reviewing" button: saving with this
  // still null just logs a plain visit with no rating attached.
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [visitedOn, setVisitedOn] = useState(todayIsoDate());
  const [isSavingVisit, setIsSavingVisit] = useState(false);
  const [savedVisitId, setSavedVisitId] = useState<string | null>(null);

  const [pendingPhotos, setPendingPhotos] = useState<CroppedPhoto[]>([]);
  const [uploadedPhotoUris, setUploadedPhotoUris] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [cropSource, setCropSource] = useState<{ uri: string; target: CropTarget } | null>(null);

  const [tagQuery, setTagQuery] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [taggedPlaces, setTaggedPlaces] = useState<PlaceRow[]>([]);
  const [isTagSearching, setIsTagSearching] = useState(false);

  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleSuggestions, setPeopleSuggestions] = useState<UserRow[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<UserRow[]>([]);
  const [isPeopleSearching, setIsPeopleSearching] = useState(false);

  const tagSessionTokenRef = useRef(createPlacesSessionToken());
  const tagDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peopleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tagDebounceRef.current) clearTimeout(tagDebounceRef.current);

    if (!tagQuery.trim()) {
      setTagSuggestions([]);
      return;
    }

    tagDebounceRef.current = setTimeout(async () => {
      setIsTagSearching(true);
      try {
        const results = await autocompletePlaces(tagQuery, tagSessionTokenRef.current);
        setTagSuggestions(results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        setIsTagSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (tagDebounceRef.current) clearTimeout(tagDebounceRef.current);
    };
  }, [tagQuery]);

  useEffect(() => {
    if (peopleDebounceRef.current) clearTimeout(peopleDebounceRef.current);
    if (!session) return;

    if (!peopleQuery.trim()) {
      setPeopleSuggestions([]);
      return;
    }

    peopleDebounceRef.current = setTimeout(async () => {
      setIsPeopleSearching(true);
      try {
        const results = await searchUsers(peopleQuery, session.user.id);
        setPeopleSuggestions(results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        setIsPeopleSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (peopleDebounceRef.current) clearTimeout(peopleDebounceRef.current);
    };
  }, [peopleQuery, session]);

  // LocationSearchModal already runs the fetchPlaceDetails/cachePlaceHierarchy
  // steps internally (see its onSelect) before handing back the final
  // PlaceRow — this just resets the rest of the review form for it.
  async function handlePlaceSelected(place: PlaceRow) {
    setError(null);
    setIsPickerOpen(false);
    try {
      const crumb = await getPlaceBreadcrumb(place);
      setSelectedPlace(place);
      setBreadcrumb(crumb);
      // Resuming a draft: this might just be correcting an auto-picked
      // place (or resolving a "needs a location" one) — keep whatever
      // rating/note/photos/tags the draft already has instead of wiping
      // them like a genuinely fresh place pick does below.
      if (currentDraftId) return;
      setRating(null);
      setNote('');
      setVisitedOn(todayIsoDate());
      setSavedVisitId(null);
      setPendingPhotos([]);
      setUploadedPhotoUris([]);
      setTagQuery('');
      setTagSuggestions([]);
      setTaggedPlaces([]);
      setPeopleQuery('');
      setPeopleSuggestions([]);
      setTaggedUsers([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that place.');
    }
  }

  // Cancelling the picker before ever picking a place means there's nothing
  // left on this screen worth seeing (no "Search places" fallback page
  // anymore, see isPickerOpen's own comment) — go back to wherever this
  // screen was pushed from (the Create menu, or place/[id]'s "Add your
  // review") instead of leaving the user on a blank review form. Once a
  // place IS selected, reopening the picker to change it and then cancelling
  // should just close it back to the filled-in form, not navigate away.
  function handlePickerCancel() {
    setIsPickerOpen(false);
    if (!selectedPlace) router.back();
  }

  // Arriving from place/[id]'s "Add your review" button — the place is
  // already in our DB (no Google Places round-trip needed), so this skips
  // straight past LocationSearchModal into the same reset handlePlaceSelected
  // already does for a normal search-picked place.
  useEffect(() => {
    if (!placeId) return;
    (async () => {
      const { data, error: fetchError } = await supabase.from('places').select('*').eq('id', placeId).single();
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      await handlePlaceSelected(data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  // Arriving from drafts.tsx to resume an unfinished review. Seeds every
  // field the draft already has; a place-less draft ("Needs a location")
  // forces the picker open immediately instead of showing a blank form with
  // no way to reach it (mirrors the fresh-arrival isPickerOpen behavior).
  useEffect(() => {
    if (!draftId || !session) return;
    (async () => {
      try {
        const draft = await getDraftForEdit(draftId, session.user.id);
        if (!draft) {
          setError('This draft is no longer available.');
          return;
        }
        setCurrentDraftId(draft.id);
        setRating(draft.rating);
        setNote(draft.note ?? '');
        setVisitedOn(draft.visitedOn);
        setPhotoSlots(draft.photos.map((p) => ({ kind: 'existing', id: p.id, url: p.url, position: p.position })));
        if (draft.place) {
          setSelectedPlace(draft.place);
          setBreadcrumb(await getPlaceBreadcrumb(draft.place));
        } else {
          setIsPickerOpen(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load that draft.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, session]);

  async function handleSelectTag(suggestion: PlaceAutocompleteSuggestion) {
    setError(null);
    setIsTagSearching(true);
    try {
      const details = await fetchPlaceDetails(suggestion.placeId, tagSessionTokenRef.current);
      const cached = await cachePlaceHierarchy(details);
      setTaggedPlaces((prev) => {
        if (cached.id === selectedPlace?.id || prev.some((p) => p.id === cached.id)) return prev;
        return [...prev, cached];
      });
      setTagQuery('');
      setTagSuggestions([]);
      tagSessionTokenRef.current = createPlacesSessionToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that location.');
    } finally {
      setIsTagSearching(false);
    }
  }

  function handleRemoveTag(placeId: string) {
    setTaggedPlaces((prev) => prev.filter((p) => p.id !== placeId));
  }

  function handleSelectPerson(user: UserRow) {
    setTaggedUsers((prev) => (prev.some((u) => u.id === user.id) ? prev : [...prev, user]));
    setPeopleQuery('');
    setPeopleSuggestions([]);
  }

  function handleRemovePerson(userId: string) {
    setTaggedUsers((prev) => prev.filter((u) => u.id !== userId));
  }

  function handleRemovePendingPhoto(index: number) {
    setPendingPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function pickImage(): Promise<ImagePicker.ImagePickerAsset | null> {
    const result = await pickImageFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required to add photos.');
      return null;
    }
    return result;
  }

  async function handlePickPhoto() {
    if (pendingPhotos.length + uploadedPhotoUris.length >= MAX_VISIT_PHOTOS) return;
    setError(null);
    const asset = await pickImage();
    if (asset) setCropSource({ uri: asset.uri, target: { kind: 'pending' } });
  }

  async function handleAddPhotoAfterSave() {
    if (!savedVisitId || uploadedPhotoUris.length >= MAX_VISIT_PHOTOS) return;
    setError(null);
    const asset = await pickImage();
    if (asset) setCropSource({ uri: asset.uri, target: { kind: 'after-save' } });
  }

  // Draft-resume photo handling — mirrors edit-visit/[id].tsx's
  // handleAddPhoto/handleRecropSlot/handleRemoveSlot exactly.
  async function handleAddDraftPhoto() {
    if (photoSlots.length >= MAX_VISIT_PHOTOS) return;
    setError(null);
    const asset = await pickImage();
    if (asset) setCropSource({ uri: asset.uri, target: { kind: 'draft-new' } });
  }

  function handleRecropDraftSlot(index: number) {
    const slot = photoSlots[index];
    setCropSource({ uri: slot.kind === 'existing' ? slot.url : slot.uri, target: { kind: 'draft-recrop', index } });
  }

  function handleRemoveDraftSlot(index: number) {
    const slot = photoSlots[index];
    if (slot.kind === 'existing') setDeletedPhotoIds((prev) => [...prev, slot.id]);
    setPhotoSlots((prev) => prev.filter((_, i) => i !== index));
  }

  function handleCropCancel() {
    setCropSource(null);
  }

  async function handleCropConfirm(result: CroppedPhoto) {
    const target = cropSource?.target;
    setCropSource(null);
    if (!target) return;

    if (target.kind === 'pending') {
      setPendingPhotos((prev) => [...prev, result]);
      return;
    }

    if (target.kind === 'after-save' && savedVisitId) {
      setIsUploadingPhoto(true);
      try {
        await uploadPhotoForVisit({
          visitId: savedVisitId,
          uri: result.uri,
          mimeType: 'image/jpeg',
          width: result.width,
          height: result.height,
          position: uploadedPhotoUris.length,
        });
        setUploadedPhotoUris((prev) => [...prev, result.uri]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not upload that photo.');
      } finally {
        setIsUploadingPhoto(false);
      }
      return;
    }

    const newSlot: PhotoSlot = { kind: 'new', uri: result.uri, width: result.width, height: result.height };

    if (target.kind === 'draft-new') {
      setPhotoSlots((prev) => [...prev, newSlot]);
      return;
    }

    if (target.kind === 'draft-recrop') {
      const recropIndex = target.index;
      setPhotoSlots((prev) => {
        const existingSlot = prev[recropIndex];
        if (existingSlot.kind === 'existing') setDeletedPhotoIds((ids) => [...ids, existingSlot.id]);
        return prev.map((slot, i) => (i === recropIndex ? newSlot : slot));
      });
    }
  }

  async function handleSaveVisit() {
    if (!session || !selectedPlace) return;
    setError(null);
    setIsSavingVisit(true);
    const isPublishingDraft = currentDraftId != null;
    try {
      let visitId: string;

      if (isPublishingDraft && currentDraftId) {
        await updateDraftFields(currentDraftId, {
          placeId: selectedPlace.id,
          rating,
          note: note.trim() || null,
          visitedOn,
        });

        for (const photoId of deletedPhotoIds) {
          await deleteDraftPhoto(photoId);
        }

        // New photos are appended after every kept existing photo's own
        // position — matches edit-visit/[id].tsx's identical position math.
        const maxExistingPosition = photoSlots.reduce(
          (max, slot) => (slot.kind === 'existing' ? Math.max(max, slot.position) : max),
          -1
        );
        let nextPosition = maxExistingPosition + 1;
        for (const slot of photoSlots) {
          if (slot.kind !== 'new') continue;
          await uploadPhotoForDraft({
            draftId: currentDraftId,
            uri: slot.uri,
            mimeType: 'image/jpeg',
            width: slot.width,
            height: slot.height,
            position: nextPosition,
          });
          nextPosition += 1;
        }

        visitId = await publishDraft(currentDraftId);
        setUploadedPhotoUris([
          ...photoSlots.filter((slot) => slot.kind === 'existing').map((slot) => slot.url),
          ...photoSlots.filter((slot) => slot.kind === 'new').map((slot) => slot.uri),
        ]);
        setCurrentDraftId(null);
      } else {
        const { data, error: insertError } = await supabase
          .from('visits')
          .insert({
            user_id: session.user.id,
            place_id: selectedPlace.id,
            rating,
            note: note.trim() || null,
            visited_on: visitedOn,
          })
          .select()
          .single();
        if (insertError) throw insertError;
        visitId = data.id;
      }

      setSavedVisitId(visitId);

      if (taggedPlaces.length > 0) {
        await supabase
          .from('visit_tagged_places')
          .insert(taggedPlaces.map((place) => ({ visit_id: visitId, place_id: place.id })));
      }

      if (taggedUsers.length > 0) {
        await supabase
          .from('visit_tagged_users')
          .insert(taggedUsers.map((user) => ({ visit_id: visitId, user_id: user.id })));
      }

      // The draft path already uploaded its new photo slots above, before
      // publish_draft ran — only the fresh-review path still has photos
      // waiting to go up.
      if (!isPublishingDraft) {
        const stillPending: CroppedPhoto[] = [];
        for (const [index, asset] of pendingPhotos.entries()) {
          try {
            await uploadPhotoForVisit({
              visitId,
              uri: asset.uri,
              mimeType: 'image/jpeg',
              width: asset.width,
              height: asset.height,
              position: index,
            });
            setUploadedPhotoUris((prev) => [...prev, asset.uri]);
          } catch {
            stillPending.push(asset);
          }
        }
        setPendingPhotos(stillPending);
        if (stillPending.length > 0) {
          setError(`Visit saved, but ${stillPending.length} photo(s) failed to upload — try again below.`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isPublishingDraft ? 'Could not publish that draft.' : 'Could not save that visit.');
    } finally {
      setIsSavingVisit(false);
    }
  }

  const totalPhotoCount = pendingPhotos.length + uploadedPhotoUris.length;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>
        </View>

        <KeyboardAwareScroll
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
        <ThemedText type="sectionLabel">Search places</ThemedText>

        <Button label="Search for a place" variant="secondary" onPress={() => setIsPickerOpen(true)} />

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        {selectedPlace && (
          <ThemedView type="backgroundElement" style={styles.resultCard}>
            <ThemedText type="smallBold">{selectedPlace.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {breadcrumb}
            </ThemedText>

            {!savedVisitId ? (
              <ThemedView style={styles.form}>
                <RatingSlider value={rating} onChange={setRating} />

                {currentDraftId ? (
                  <View style={styles.photoSection}>
                    {photoSlots.length > 0 && (
                      <View style={styles.photoRow}>
                        {photoSlots.map((slot, index) => (
                          <Pressable
                            key={slot.kind === 'existing' ? slot.id : slot.uri}
                            onPress={() => handleRecropDraftSlot(index)}
                            style={styles.photoTile}>
                            <Image source={{ uri: slot.kind === 'existing' ? slot.url : slot.uri }} style={styles.photoThumbnail} />
                            <Pressable
                              onPress={() => handleRemoveDraftSlot(index)}
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
                        onPress={handleAddDraftPhoto}
                      />
                    )}
                    {photoSlots.length > 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        Tap a photo to recrop it.
                      </ThemedText>
                    )}
                  </View>
                ) : (
                  <View style={styles.photoSection}>
                    {(pendingPhotos.length > 0 || uploadedPhotoUris.length > 0) && (
                      <View style={styles.photoRow}>
                        {pendingPhotos.map((asset, index) => (
                          <Pressable key={asset.uri} onPress={() => handleRemovePendingPhoto(index)}>
                            <Image source={{ uri: asset.uri }} style={styles.photoThumbnail} />
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {totalPhotoCount < MAX_VISIT_PHOTOS && (
                      <Button
                        label={`Add photo (${totalPhotoCount}/${MAX_VISIT_PHOTOS})`}
                        variant="secondary"
                        onPress={handlePickPhoto}
                      />
                    )}
                  </View>
                )}

                <TextField
                  placeholder="Note (optional)"
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
                <DateCarousel value={visitedOn} onChange={setVisitedOn} />

                <View style={styles.tagSection}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Tag specific spots (optional)
                  </ThemedText>
                  {taggedPlaces.length > 0 && (
                    <View style={styles.tagRow}>
                      {taggedPlaces.map((place) => (
                        <Pressable key={place.id} onPress={() => handleRemoveTag(place.id)}>
                          <ThemedView type="backgroundSelected" style={styles.tagChip}>
                            <ThemedText type="small">{place.name} ✕</ThemedText>
                          </ThemedView>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <TextField
                    placeholder="Search a trail, landmark, spot..."
                    value={tagQuery}
                    onChangeText={setTagQuery}
                  />
                  {tagSuggestions.map((item) => (
                    <Pressable key={item.placeId} onPress={() => handleSelectTag(item)}>
                      <ThemedView type="backgroundSelected" style={styles.suggestionRow}>
                        <ThemedText type="small">{item.primaryText}</ThemedText>
                        {item.secondaryText && (
                          <ThemedText type="small" themeColor="textSecondary">
                            {item.secondaryText}
                          </ThemedText>
                        )}
                      </ThemedView>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.tagSection}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Tag people (optional)
                  </ThemedText>
                  {taggedUsers.length > 0 && (
                    <View style={styles.tagRow}>
                      {taggedUsers.map((user) => (
                        <Pressable key={user.id} onPress={() => handleRemovePerson(user.id)}>
                          <ThemedView type="backgroundSelected" style={styles.tagChip}>
                            <ThemedText type="small">
                              {user.name ?? user.handle ?? 'Someone'} ✕
                            </ThemedText>
                          </ThemedView>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <TextField
                    placeholder="Search by name or username..."
                    value={peopleQuery}
                    onChangeText={setPeopleQuery}
                  />
                  {peopleSuggestions.map((user) => (
                    <Pressable key={user.id} onPress={() => handleSelectPerson(user)}>
                      <ThemedView type="backgroundSelected" style={styles.suggestionRow}>
                        <ThemedText type="small">{user.name ?? user.handle ?? 'Someone'}</ThemedText>
                      </ThemedView>
                    </Pressable>
                  ))}
                </View>

                <Button
                  label={currentDraftId ? 'Publish' : 'Save visit'}
                  onPress={handleSaveVisit}
                  loading={isSavingVisit}
                />
              </ThemedView>
            ) : (
              <ThemedView style={styles.form}>
                <ThemedText type="small">Visit saved.</ThemedText>

                {uploadedPhotoUris.length > 0 && (
                  <View style={styles.photoRow}>
                    {uploadedPhotoUris.map((uri) => (
                      <Image key={uri} source={{ uri }} style={styles.photoThumbnail} />
                    ))}
                  </View>
                )}

                {uploadedPhotoUris.length < MAX_VISIT_PHOTOS && (
                  <Button
                    label={`Add photo (${uploadedPhotoUris.length}/${MAX_VISIT_PHOTOS})`}
                    variant="secondary"
                    onPress={handleAddPhotoAfterSave}
                    loading={isUploadingPhoto}
                  />
                )}

                <SaveToBoard visitId={savedVisitId} isOwnerOrTagged />
              </ThemedView>
            )}
          </ThemedView>
        )}

        </KeyboardAwareScroll>

        <PhotoCropModal
          visible={cropSource != null}
          uri={cropSource?.uri ?? null}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
          allowRatioSelection
        />
        <LocationSearchModal
          visible={isPickerOpen}
          onCancel={handlePickerCancel}
          onSelect={handlePlaceSelected}
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
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  scrollContent: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  suggestionRow: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.half,
  },
  resultCard: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
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
  photoThumbnail: {
    width: 64,
    height: 64,
    borderRadius: Spacing.two,
  },
  photoTile: {
    width: 64,
    height: 64,
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
  tagSection: {
    gap: Spacing.two,
  },
  tagRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  tagChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
});
