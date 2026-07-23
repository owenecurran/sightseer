import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { StarRating } from '@/components/ui/star-rating';
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
import { cachePlaceHierarchy, getPlaceBreadcrumb } from '@/lib/places-cache';
import { uploadPhotoForVisit } from '@/lib/photo-upload';
import { supabase } from '@/lib/supabase';

const DEBOUNCE_MS = 300;

type PlaceRow = Database['public']['Tables']['places']['Row'];

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
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [visitedOn, setVisitedOn] = useState(todayIsoDate());
  const [isSavingVisit, setIsSavingVisit] = useState(false);
  const [savedVisitId, setSavedVisitId] = useState<string | null>(null);

  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const sessionTokenRef = useRef(createPlacesSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function handleSelect(suggestion: PlaceAutocompleteSuggestion) {
    setError(null);
    setIsSearching(true);
    try {
      const details = await fetchPlaceDetails(suggestion.placeId, sessionTokenRef.current);
      const cached = await cachePlaceHierarchy(details);
      const crumb = await getPlaceBreadcrumb(cached);
      setSelectedPlace(cached);
      setBreadcrumb(crumb);
      setRating(0);
      setNote('');
      setVisitedOn(todayIsoDate());
      setSavedVisitId(null);
      setPhotoUris([]);
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

  async function handleSaveVisit() {
    if (!session || !selectedPlace || rating === 0) return;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that visit.');
    } finally {
      setIsSavingVisit(false);
    }
  }

  async function handleAddPhoto() {
    if (!savedVisitId) return;
    setError(null);

    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Photo library permission is required to add photos.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setIsUploadingPhoto(true);
    try {
      await uploadPhotoForVisit({
        visitId: savedVisitId,
        uri: asset.uri,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        position: photoUris.length,
      });
      setPhotoUris((prev) => [...prev, asset.uri]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  }

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
                <StarRating value={rating} onChange={setRating} />
                <TextField
                  placeholder="Note (optional)"
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
                <TextField
                  placeholder="Visited on (YYYY-MM-DD)"
                  value={visitedOn}
                  onChangeText={setVisitedOn}
                />
                <Button
                  label="Save visit"
                  onPress={handleSaveVisit}
                  loading={isSavingVisit}
                  disabled={rating === 0}
                />
              </ThemedView>
            ) : (
              <ThemedView style={styles.form}>
                <ThemedText type="small">Visit saved.</ThemedText>

                {photoUris.length > 0 && (
                  <View style={styles.photoRow}>
                    {photoUris.map((uri) => (
                      <Image key={uri} source={{ uri }} style={styles.photoThumbnail} />
                    ))}
                  </View>
                )}

                <Button
                  label="Add photo"
                  variant="secondary"
                  onPress={handleAddPhoto}
                  loading={isUploadingPhoto}
                />
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
  pressed: {
    opacity: 0.7,
  },
});
