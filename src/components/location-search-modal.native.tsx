import { Camera, MapView, PointAnnotation } from '@rnmapbox/maps';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, Spacing } from '@/constants/theme';
import { MAPBOX_STYLE_URL } from '@/constants/mapbox.native';
import type { Database } from '@/lib/database.types';
import {
  autocompletePlaces,
  createPlacesSessionToken,
  fetchPlaceDetails,
  type PlaceAutocompleteSuggestion,
  type PlaceDetails,
} from '@/lib/google-places';
import { cachePlaceHierarchy } from '@/lib/places-cache';

type PlaceRow = Database['public']['Tables']['places']['Row'];

type LocationSearchModalProps = {
  visible: boolean;
  onCancel: () => void;
  onSelect: (place: PlaceRow) => void;
};

const DEBOUNCE_MS = 300;
const DEFAULT_ZOOM = 3;
const SELECTED_ZOOM = 13;

// The real map — only rendered on iOS/Android (see location-search-modal.tsx
// for why web falls back to plain text search). Google Places stays the only
// search data source (per the plan, free-form tap-to-drop-pin is explicitly
// out of scope for v1): the map here is for visually confirming a searched
// result, not an independent way to pick a location. Mapbox's default
// POI/label layers are left as-is for v1 (MAPBOX_STYLE_URL is the built-in
// dark style) — hiding them needs the SDK's style-layer API, noted as a
// fast-follow rather than blocking this component on style polish.
export function LocationSearchModal({ visible, onCancel, onSelect }: LocationSearchModalProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<PlaceDetails | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const sessionTokenRef = useRef(createPlacesSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef<Camera>(null);

  // Reset to a blank search each time the picker is (re)opened, rather than
  // showing a stale previous search.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSuggestions([]);
    setError(null);
    setSelectedDetails(null);
    sessionTokenRef.current = createPlacesSessionToken();
  }, [visible]);

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
        setSuggestions(await autocompletePlaces(query, sessionTokenRef.current));
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

  async function handleSuggestionSelect(suggestion: PlaceAutocompleteSuggestion) {
    setError(null);
    try {
      const details = await fetchPlaceDetails(suggestion.placeId, sessionTokenRef.current);
      setSelectedDetails(details);
      setSuggestions([]);
      // Mapbox coordinates are [longitude, latitude] — the opposite order
      // from the {latitude, longitude} objects expo-maps/react-native-maps
      // use elsewhere in this app, easy to transpose by mistake.
      cameraRef.current?.setCamera({
        centerCoordinate: [details.lng, details.lat],
        zoomLevel: SELECTED_ZOOM,
        animationDuration: 600,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that place.');
    }
  }

  async function handleConfirm() {
    if (!selectedDetails) return;
    setIsConfirming(true);
    setError(null);
    try {
      const cached = await cachePlaceHierarchy(selectedDetails);
      onSelect(cached);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that place.');
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <MapView style={styles.map} styleURL={MAPBOX_STYLE_URL} scaleBarEnabled={false}>
          <Camera ref={cameraRef} defaultSettings={{ zoomLevel: DEFAULT_ZOOM }} />
          {selectedDetails && (
            <PointAnnotation id="selected-place" coordinate={[selectedDetails.lng, selectedDetails.lat]}>
              <View style={styles.pin} />
            </PointAnnotation>
          )}
        </MapView>

        <SafeAreaView style={styles.overlay} pointerEvents="box-none">
          <View style={styles.searchBar}>
            <Pressable onPress={onCancel} style={styles.cancelButton}>
              <ThemedText type="smallBold" themeColor="background">
                Cancel
              </ThemedText>
            </Pressable>
            <TextField
              placeholder="Search for a place"
              value={query}
              onChangeText={setQuery}
              style={styles.input}
            />
          </View>

          {error && (
            <View style={styles.messageBox}>
              <ThemedText type="small">{error}</ThemedText>
            </View>
          )}
          {isSearching && !error && (
            <View style={styles.messageBox}>
              <ThemedText type="small">Searching…</ThemedText>
            </View>
          )}

          {suggestions.length > 0 && (
            <View style={styles.suggestions}>
              {suggestions.map((s) => (
                <Pressable key={s.placeId} onPress={() => handleSuggestionSelect(s)} style={styles.suggestionRow}>
                  <ThemedText type="small">{s.primaryText}</ThemedText>
                  {s.secondaryText && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {s.secondaryText}
                    </ThemedText>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          {selectedDetails && (
            <View style={styles.confirmBar}>
              <Button
                label={`Use ${selectedDetails.displayName}`}
                onPress={handleConfirm}
                loading={isConfirming}
              />
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  searchBar: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: BrandColors.cream,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  input: {
    flex: 1,
  },
  messageBox: {
    marginTop: Spacing.two,
    backgroundColor: BrandColors.cream,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  suggestions: {
    marginTop: Spacing.two,
    backgroundColor: BrandColors.cream,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: Spacing.half,
  },
  confirmBar: {
    gap: Spacing.two,
  },
  pin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BrandColors.sage,
    borderWidth: 3,
    borderColor: BrandColors.cream,
  },
});
