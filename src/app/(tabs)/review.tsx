import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_VISIT_PHOTOS } from '@/components/photo-grid';
import { SaveToBoard } from '@/components/save-to-board';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { DateCarousel } from '@/components/ui/date-carousel';
import { RatingSlider } from '@/components/ui/rating-slider';
import { TextField } from '@/components/ui/text-field';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SearchScreen() {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [selectedPlace, setSelectedPlace] = useState<PlaceRow | null>(null);
  const [breadcrumb, setBreadcrumb] = useState('');
  const [rating, setRating] = useState(5);
  const [note, setNote] = useState('');
  const [visitedOn, setVisitedOn] = useState(todayIsoDate());
  const [isSavingVisit, setIsSavingVisit] = useState(false);
  const [savedVisitId, setSavedVisitId] = useState<string | null>(null);

  const [pendingPhotos, setPendingPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [uploadedPhotoUris, setUploadedPhotoUris] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [tagQuery, setTagQuery] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [taggedPlaces, setTaggedPlaces] = useState<PlaceRow[]>([]);
  const [isTagSearching, setIsTagSearching] = useState(false);

  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleSuggestions, setPeopleSuggestions] = useState<UserRow[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<UserRow[]>([]);
  const [isPeopleSearching, setIsPeopleSearching] = useState(false);

  const sessionTokenRef = useRef(createPlacesSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagSessionTokenRef = useRef(createPlacesSessionToken());
  const tagDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peopleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        const results = await autocompletePlaces(query, sessionTokenRef.current);
        setSuggestions(results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

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

  async function handleSelect(suggestion: PlaceAutocompleteSuggestion) {
    setError(null);
    setIsSearching(true);
    try {
      const details = await fetchPlaceDetails(suggestion.placeId, sessionTokenRef.current);
      const cached = await cachePlaceHierarchy(details);
      const crumb = await getPlaceBreadcrumb(cached);
      setSelectedPlace(cached);
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
      setQuery('');
      setSuggestions([]);
      // Session is done (Place Details closed it) — start a fresh one for the next search.
      sessionTokenRef.current = createPlacesSessionToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that place.');
    } finally {
      setIsSearching(false);
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
    if (asset) setPendingPhotos((prev) => [...prev, asset]);
  }

  async function handleAddPhotoAfterSave() {
    if (!savedVisitId || uploadedPhotoUris.length >= MAX_VISIT_PHOTOS) return;
    setError(null);
    const asset = await pickImage();
    if (!asset) return;

    setIsUploadingPhoto(true);
    try {
      await uploadPhotoForVisit({
        visitId: savedVisitId,
        uri: asset.uri,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        position: uploadedPhotoUris.length,
      });
      setUploadedPhotoUris((prev) => [...prev, asset.uri]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setIsUploadingPhoto(false);
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

      const stillPending: ImagePicker.ImagePickerAsset[] = [];
      for (const [index, asset] of pendingPhotos.entries()) {
        try {
          await uploadPhotoForVisit({
            visitId: data.id,
            uri: asset.uri,
            mimeType: asset.mimeType,
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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Search places</ThemedText>

        <TextField
          placeholder="Search a country, town, or place"
          value={query}
          onChangeText={setQuery}
        />

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

        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.placeId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable onPress={() => handleSelect(item)} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.suggestionRow}>
                <ThemedText type="default">{item.primaryText}</ThemedText>
                {item.secondaryText && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.secondaryText}
                  </ThemedText>
                )}
              </ThemedView>
            </Pressable>
          )}
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.two,
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
  pressed: {
    opacity: 0.7,
  },
});
