import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
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

export default function SearchScreen() {
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  const [selectedPlace, setSelectedPlace] = useState<PlaceRow | null>(null);
  const [breadcrumb, setBreadcrumb] = useState('');
  const [rating, setRating] = useState(5);
  const [note, setNote] = useState('');
  const [visitedOn, setVisitedOn] = useState(todayIsoDate());
  const [isSavingVisit, setIsSavingVisit] = useState(false);
  const [savedVisitId, setSavedVisitId] = useState<string | null>(null);

  const [pendingPhotos, setPendingPhotos] = useState<CroppedPhoto[]>([]);
  const [uploadedPhotoUris, setUploadedPhotoUris] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [cropSource, setCropSource] = useState<{ uri: string; target: 'pending' | 'after-save' } | null>(
    null
  );

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
      setRating(5);
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
    if (asset) setCropSource({ uri: asset.uri, target: 'pending' });
  }

  async function handleAddPhotoAfterSave() {
    if (!savedVisitId || uploadedPhotoUris.length >= MAX_VISIT_PHOTOS) return;
    setError(null);
    const asset = await pickImage();
    if (asset) setCropSource({ uri: asset.uri, target: 'after-save' });
  }

  function handleCropCancel() {
    setCropSource(null);
  }

  async function handleCropConfirm(result: CroppedPhoto) {
    const target = cropSource?.target;
    setCropSource(null);

    if (target === 'pending') {
      setPendingPhotos((prev) => [...prev, result]);
      return;
    }

    if (target === 'after-save' && savedVisitId) {
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
    }
  }

  async function handleSaveVisit() {
    if (!session || !selectedPlace) return;
    setError(null);
    setIsSavingVisit(true);
    try {
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
      setSavedVisitId(data.id);

      if (taggedPlaces.length > 0) {
        await supabase
          .from('visit_tagged_places')
          .insert(taggedPlaces.map((place) => ({ visit_id: data.id, place_id: place.id })));
      }

      if (taggedUsers.length > 0) {
        await supabase
          .from('visit_tagged_users')
          .insert(taggedUsers.map((user) => ({ visit_id: data.id, user_id: user.id })));
      }

      const stillPending: CroppedPhoto[] = [];
      for (const [index, asset] of pendingPhotos.entries()) {
        try {
          await uploadPhotoForVisit({
            visitId: data.id,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that visit.');
    } finally {
      setIsSavingVisit(false);
    }
  }

  const totalPhotoCount = pendingPhotos.length + uploadedPhotoUris.length;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={styles.scrollContent}
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
                  label="Save visit"
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

                <SaveToBoard visitId={savedVisitId} />
              </ThemedView>
            )}
          </ThemedView>
        )}

        </Animated.ScrollView>

        <PhotoCropModal
          visible={cropSource != null}
          uri={cropSource?.uri ?? null}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
        <LocationSearchModal
          visible={isPickerOpen}
          onCancel={() => setIsPickerOpen(false)}
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
  scrollContent: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    paddingBottom: BottomTabInset,
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
