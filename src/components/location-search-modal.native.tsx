import { Camera, MapView, MarkerView, PointAnnotation, type MapState } from '@rnmapbox/maps';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NearbyPlacePreviewCard } from '@/components/nearby-place-preview-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, Spacing } from '@/constants/theme';
import { MAPBOX_STYLE_URL } from '@/constants/mapbox.native';
import { getCurrentLocation } from '@/lib/current-location';
import type { Database } from '@/lib/database.types';
import {
  autocompletePlaces,
  createPlacesSessionToken,
  fetchPlaceDetails,
  findNearbyPlace,
  type PlaceAutocompleteSuggestion,
  type PlaceDetails,
} from '@/lib/google-places';
import { getNearbyReviewedPlaces, getPlacePreviewReview, type NearbyPlace, type PlacePreview } from '@/lib/nearby-places';
import { cachePlaceHierarchy } from '@/lib/places-cache';

type PlaceRow = Database['public']['Tables']['places']['Row'];

type LocationSearchModalProps = {
  visible: boolean;
  onCancel: () => void;
  // Optional/unused in 'browse' mode — that mode navigates internally
  // instead of handing a picked place back to the caller. See the
  // mode-specific comment above the component body.
  onSelect?: (place: PlaceRow) => void;
  // 'pick': today's picker behavior (search → select → confirm bar →
  // onSelect), used by review.tsx to choose the place a new review is
  // about. 'browse': the Locations tab's read-only map — search still
  // recenters the camera, but instead of a confirm bar, markers for places
  // with existing reviews appear as the viewport settles, and tapping one
  // shows a preview card that navigates to /place/[id] on tap. Defaults to
  // 'pick' so review.tsx needs no changes.
  mode?: 'pick' | 'browse';
};

const DEBOUNCE_MS = 300;
const DEFAULT_ZOOM = 3;
const SELECTED_ZOOM = 13;
// A "show me my surrounding streets/neighborhood" zoom level, the same kind
// of default most consumer map apps open to for a current-location view —
// close enough to be genuinely useful, far enough out that a short drive
// doesn't immediately fall off the edge of the visible map.
const CURRENT_LOCATION_ZOOM = 14;
const VIEWPORT_DEBOUNCE_MS = 500;

// The real map — only rendered on iOS/Android (see location-search-modal.tsx
// for why web falls back to plain text search). Google Places stays the only
// search data source (per the plan, free-form tap-to-drop-pin is explicitly
// out of scope for v1): the map here is for visually confirming a searched
// result, not an independent way to pick a location. Mapbox's default
// POI/label layers are left as-is for v1 (MAPBOX_STYLE_URL is the built-in
// dark style) — hiding them needs the SDK's style-layer API, noted as a
// fast-follow rather than blocking this component on style polish.
export function LocationSearchModal({ visible, onCancel, onSelect, mode = 'pick' }: LocationSearchModalProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<PlaceDetails | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [previewPlaceId, setPreviewPlaceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PlacePreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  // Uber-style "drag the map to name an unmarked spot" (pick mode only) —
  // the center-pin lookup, independent of selectedDetails (an explicit
  // search pick). null = nothing resolved yet; explicit `false`-ish states
  // aren't needed since isLoadingCenterPlace covers "still looking."
  const [centerPlace, setCenterPlace] = useState<PlaceDetails | null>(null);
  const [isLoadingCenterPlace, setIsLoadingCenterPlace] = useState(false);
  const [hasSearchedCenter, setHasSearchedCenter] = useState(false);

  const sessionTokenRef = useRef(createPlacesSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef<Camera>(null);
  const mapRef = useRef<MapView>(null);
  // Set right before any camera move this component itself triggers
  // (current-location centering on open, recentering to a selected search
  // suggestion) so the resulting onMapIdle settle doesn't get treated as a
  // real user drag and overwrite that specific pick with an incidental
  // nearby-lookup match for the same spot.
  const isProgrammaticMoveRef = useRef(false);
  // `useSafeAreaInsets()` read directly rather than `SafeAreaView` — RN's
  // `Modal` presents in its own native view hierarchy on iOS, which
  // `SafeAreaView`'s automatic inset detection doesn't reliably reach into
  // (confirmed live: the search bar rendered up under the status bar/notch,
  // unreachable). Reading the insets explicitly and applying them as padding
  // works regardless of which native layer the Modal's content lives in —
  // the same approach `floating-nav-bar.tsx` already uses successfully.
  const insets = useSafeAreaInsets();

  // Reset to a blank search each time the picker is (re)opened, rather than
  // showing a stale previous search.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSuggestions([]);
    setError(null);
    setSelectedDetails(null);
    setNearbyPlaces([]);
    setPreviewPlaceId(null);
    setPreview(null);
    setCenterPlace(null);
    setHasSearchedCenter(false);
    sessionTokenRef.current = createPlacesSessionToken();

    // Best-effort: center on the user's current location when the picker
    // opens, before any search happens. If permission is denied or location
    // can't be determined, getCurrentLocation() resolves null and the map
    // just stays at its DEFAULT_ZOOM world view — never blocks opening the
    // picker. `cancelled` guards against animating a camera for a request
    // that resolves after the user already closed the picker.
    let cancelled = false;
    getCurrentLocation().then((coords) => {
      if (cancelled || !coords) return;
      isProgrammaticMoveRef.current = true;
      cameraRef.current?.setCamera({
        centerCoordinate: [coords.lng, coords.lat],
        zoomLevel: CURRENT_LOCATION_ZOOM,
        animationDuration: 800,
      });
    });
    return () => {
      cancelled = true;
    };
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
    Keyboard.dismiss();
    try {
      const details = await fetchPlaceDetails(suggestion.placeId, sessionTokenRef.current);
      setSuggestions([]);
      // Mapbox coordinates are [longitude, latitude] — the opposite order
      // from the {latitude, longitude} objects expo-maps/react-native-maps
      // use elsewhere in this app, easy to transpose by mistake.
      isProgrammaticMoveRef.current = true;
      cameraRef.current?.setCamera({
        centerCoordinate: [details.lng, details.lat],
        zoomLevel: SELECTED_ZOOM,
        animationDuration: 600,
      });
      // 'browse' mode: search is just a way to jump the camera to an area
      // (matching a searched suggestion to a confirm-bar pick doesn't apply
      // here — there's nothing to "confirm", the map is read-only). 'pick'
      // mode keeps today's behavior: show a pin + confirm bar for this
      // specific result.
      if (mode === 'pick') {
        setSelectedDetails(details);
        setCenterPlace(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that place.');
    }
  }

  // Pressing the keyboard's return key previously did nothing — the
  // keyboard just stayed open with no way to act on it. Selecting the top
  // suggestion (if any) matches how this autocomplete already behaves on a
  // tap, so return does the same thing tapping the first result would;
  // dismissing the keyboard otherwise, so return always does *something*
  // rather than only occasionally.
  function handleSearchSubmit() {
    if (suggestions.length > 0) {
      handleSuggestionSelect(suggestions[0]);
    } else {
      Keyboard.dismiss();
    }
  }

  async function handleConfirm() {
    const target = selectedDetails ?? centerPlace;
    if (!target) return;
    setIsConfirming(true);
    setError(null);
    try {
      const cached = await cachePlaceHierarchy(target);
      onSelect?.(cached);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that place.');
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleMapIdle(state: MapState) {
    // A camera move this component itself triggered (current-location
    // centering, recentering to a selected search suggestion) already knows
    // what place it's centered on — skip re-deriving it from a nearby-lookup
    // for the exact same spot.
    if (isProgrammaticMoveRef.current) {
      isProgrammaticMoveRef.current = false;
      return;
    }

    if (mode === 'pick') {
      // A real drag always means "I'm looking somewhere new" — an explicit
      // search pick no longer applies once the user has moved the map
      // themselves.
      setSelectedDetails(null);
      const [lng, lat] = state.properties.center;
      if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
      viewportDebounceRef.current = setTimeout(async () => {
        setIsLoadingCenterPlace(true);
        try {
          setCenterPlace(await findNearbyPlace(lat, lng));
        } catch {
          // Best-effort, same reasoning as browse mode's nearby fetch below —
          // a failed lookup shouldn't block the map, the user can still type
          // a search instead.
          setCenterPlace(null);
        } finally {
          setIsLoadingCenterPlace(false);
          setHasSearchedCenter(true);
        }
      }, VIEWPORT_DEBOUNCE_MS);
      return;
    }

    if (mode !== 'browse') return;
    if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
    viewportDebounceRef.current = setTimeout(async () => {
      const bounds = await mapRef.current?.getVisibleBounds();
      if (!bounds) return;
      // getVisibleBounds() returns [[rightLon, topLat], [leftLon, bottomLat]].
      const [[maxLng, maxLat], [minLng, minLat]] = bounds;
      try {
        setNearbyPlaces(await getNearbyReviewedPlaces({ minLng, minLat, maxLng, maxLat }));
      } catch {
        // Best-effort — a failed nearby-places fetch shouldn't block the map
        // itself from being usable, so it's silently skipped rather than
        // surfaced as a blocking error banner.
      }
    }, VIEWPORT_DEBOUNCE_MS);
  }

  async function handleNearbyMarkerPress(place: NearbyPlace) {
    setPreviewPlaceId(place.id);
    setPreview(null);
    setIsPreviewLoading(true);
    try {
      setPreview(await getPlacePreviewReview(place.id));
    } finally {
      setIsPreviewLoading(false);
    }
  }

  function handlePreviewPress() {
    if (!previewPlaceId) return;
    onCancel();
    router.push({ pathname: '/place/[id]', params: { id: previewPlaceId } });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={styles.map}
          styleURL={MAPBOX_STYLE_URL}
          scaleBarEnabled={false}
          onMapIdle={handleMapIdle}>
          <Camera ref={cameraRef} defaultSettings={{ zoomLevel: DEFAULT_ZOOM }} />
          {selectedDetails && (
            <PointAnnotation id="selected-place" coordinate={[selectedDetails.lng, selectedDetails.lat]}>
              <View style={styles.pin} />
            </PointAnnotation>
          )}
          {mode === 'browse' &&
            nearbyPlaces.map((place) => (
              // MarkerView, not PointAnnotation — PointAnnotation's own SDK
              // docs say it rasterizes children onto a bitmap, which broke
              // touch handling entirely (confirmed live: onSelected never
              // fired, even for an unmissably large 60×60 test marker,
              // despite the marker visibly rendering at the right spot).
              // MarkerView renders a real interactive view instead, and its
              // own docs say to put a Pressable/TouchableOpacity directly
              // inside rather than using an onPress prop on the marker
              // itself (it doesn't have one).
              <MarkerView key={place.id} coordinate={[place.lng, place.lat]}>
                <Pressable onPress={() => handleNearbyMarkerPress(place)}>
                  <View style={styles.reviewPin} />
                </Pressable>
              </MarkerView>
            ))}
        </MapView>

        {/* Uber-style fixed center pin — a screen-space element, not a map
            marker, so it visually stays put while the map pans underneath
            it. `centerPinDot`'s own negative margin (half its own size)
            shifts it so its tip, not its geometric center, marks the true
            center point. pointerEvents="none" so it never blocks map-drag
            gestures. */}
        {mode === 'pick' && (
          <View style={styles.centerPinWrap} pointerEvents="none">
            <View style={styles.centerPinDot} />
          </View>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[
            styles.overlay,
            { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.three },
          ]}
          pointerEvents="box-none">
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
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
              style={styles.input}
            />
          </View>

          {error && (
            <ThemedView type="backgroundElement" style={styles.messageBox}>
              <ThemedText type="small">{error}</ThemedText>
            </ThemedView>
          )}
          {isSearching && !error && (
            <ThemedView type="backgroundElement" style={styles.messageBox}>
              <ThemedText type="small">Searching…</ThemedText>
            </ThemedView>
          )}

          {suggestions.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.suggestions}>
              <ScrollView
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
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
              </ScrollView>
            </ThemedView>
          )}

          {mode === 'pick' && (selectedDetails || centerPlace) && (
            <View style={styles.confirmBar}>
              <Button
                label={`Use ${(selectedDetails ?? centerPlace)!.displayName}`}
                onPress={handleConfirm}
                loading={isConfirming}
              />
            </View>
          )}
          {mode === 'pick' && !selectedDetails && !centerPlace && isLoadingCenterPlace && (
            <ThemedView type="backgroundElement" style={styles.messageBox}>
              <ThemedText type="small">Looking here…</ThemedText>
            </ThemedView>
          )}
          {mode === 'pick' && !selectedDetails && !centerPlace && !isLoadingCenterPlace && hasSearchedCenter && (
            <ThemedView type="backgroundElement" style={styles.messageBox}>
              <ThemedText type="small" themeColor="textSecondary">
                No named place here — try dragging a bit or search instead.
              </ThemedText>
            </ThemedView>
          )}

          {mode === 'browse' && previewPlaceId && (
            <View style={styles.confirmBar}>
              {isPreviewLoading && (
                <ThemedView type="backgroundElement" style={styles.messageBox}>
                  <ThemedText type="small">Loading…</ThemedText>
                </ThemedView>
              )}
              {!isPreviewLoading && preview && (
                <NearbyPlacePreviewCard preview={preview} onPress={handlePreviewPress} />
              )}
            </View>
          )}
        </KeyboardAvoidingView>
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
  centerPinWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Shifted up by half its own height so the *tip* of the pin (its visual
  // bottom point, not its geometric center) marks the true center
  // coordinate — same convention the map's other pin styles use.
  centerPinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BrandColors.sage,
    borderWidth: 3,
    borderColor: BrandColors.cream,
    transform: [{ translateY: -10 }],
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
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  // maxHeight bounds it so the inner ScrollView is actually scrollable (and
  // so keyboardDismissMode="on-drag" has something to drag) instead of just
  // growing to fit every suggestion.
  suggestions: {
    marginTop: Spacing.two,
    borderRadius: Spacing.three,
    maxHeight: 280,
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
  // Inverse of `pin` above (cream fill, sage border) — a deliberately
  // distinct look from the single pick-mode selection pin, since browse
  // mode can show many of these at once and they mean something different
  // ("an existing review here") rather than "this is what you searched for".
  reviewPin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: BrandColors.cream,
    borderWidth: 3,
    borderColor: BrandColors.sage,
  },
});
