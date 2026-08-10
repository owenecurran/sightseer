import { Camera, MapView, MarkerView, PointAnnotation, type MapState } from '@rnmapbox/maps';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NearbyPlacePreviewCard } from '@/components/nearby-place-preview-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, Colors, Spacing } from '@/constants/theme';
import { MAPBOX_STYLE_URL } from '@/constants/mapbox.native';
import { getCurrentLocation } from '@/lib/current-location';
import type { Database } from '@/lib/database.types';
import {
  autocompletePlaces,
  createPlacesSessionToken,
  fetchPlaceDetails,
  findNearbyPlaces,
  type PlaceAutocompleteSuggestion,
  type PlaceDetails,
} from '@/lib/google-places';
import { getNearbyReviewedPlaces, getPlacePreviewReview, type NearbyPlace, type PlacePreview } from '@/lib/nearby-places';
import { cachePlaceHierarchy, getLocalityName } from '@/lib/places-cache';

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
  // Opens already centered here instead of the user's current GPS location
  // — review-form.tsx's "Tag specific spots" picker uses this to start at
  // the review's own place, since a spot being tagged is almost always near
  // it, not near wherever the phone currently is.
  initialCenter?: { lat: number; lng: number };
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
// Enough options to choose from without the list ever needing to scroll —
// see the results View's own comment for why "never needs to scroll" is
// the point (a scroll container's bounds are a drag-capturing dead zone
// wherever they exceed its content, which is what kept blocking map
// panning under the results area).
const MAX_VISIBLE_RESULTS = 5;

// The real map — only rendered on iOS/Android (see location-search-modal.tsx
// for why web falls back to plain text search). Google Places stays the only
// search data source (per the plan, free-form tap-to-drop-pin is explicitly
// out of scope for v1): the map here is for visually confirming a searched
// result, not an independent way to pick a location. Mapbox's default
// POI/label layers are left as-is for v1 (MAPBOX_STYLE_URL is the built-in
// dark style) — hiding them needs the SDK's style-layer API, noted as a
// fast-follow rather than blocking this component on style polish.
export function LocationSearchModal({
  visible,
  onCancel,
  onSelect,
  mode = 'pick',
  initialCenter,
}: LocationSearchModalProps) {
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
  // Uber-style "drag the map to name an unmarked spot" — the center-pin
  // lookup, independent of selectedDetails (an explicit search pick). Now
  // used in both modes (pick: choose among candidates to confirm; browse:
  // choose among candidates to jump straight to that place's page). Up to
  // NEARBY_MAX_RESULTS candidates; `selectedCenterPlace` is which one (if
  // any) the user tapped from that list, pick-mode only.
  const [centerCandidates, setCenterCandidates] = useState<PlaceDetails[]>([]);
  const [selectedCenterPlace, setSelectedCenterPlace] = useState<PlaceDetails | null>(null);
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
    setCenterCandidates([]);
    setSelectedCenterPlace(null);
    setHasSearchedCenter(false);
    sessionTokenRef.current = createPlacesSessionToken();

    // A caller-provided center (e.g. the place being reviewed, for "Tag
    // specific spots") wins outright — no reason to ask for/wait on GPS
    // when the far more relevant origin was already handed to us.
    if (initialCenter) {
      isProgrammaticMoveRef.current = true;
      cameraRef.current?.setCamera({
        centerCoordinate: [initialCenter.lng, initialCenter.lat],
        zoomLevel: SELECTED_ZOOM,
        animationDuration: 0,
      });
      return;
    }

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
    // Depends on the *coordinates*, not the `initialCenter` object itself —
    // callers (review-form.tsx) pass a fresh object literal every render, so
    // depending on the reference would re-run this whole reset (snapping the
    // camera back, discarding any manual pan) on every unrelated parent
    // re-render while the picker sits open, not just when it's (re)opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialCenter?.lat, initialCenter?.lng]);

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
      if (mode === 'pick') {
        setSelectedDetails(details);
        setCenterCandidates([]);
        setSelectedCenterPlace(null);
      }
      // 'browse' mode: go straight to that place's page instead of just
      // recentering and waiting for the user to also tap a resulting
      // nearby-candidate chip — same navigation handleCenterCandidatePress
      // below already does for the candidate-tap path.
      if (mode === 'browse') {
        const cached = await cachePlaceHierarchy(details);
        onCancel();
        router.push({ pathname: '/place/[id]', params: { id: cached.id } });
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
    const target = selectedDetails ?? selectedCenterPlace;
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

  // pick mode: choosing among the center-pin candidates just picks the
  // confirm-bar target, same as an explicit search pick. browse mode has no
  // "confirm" concept — tapping a candidate there jumps straight to that
  // place's page, mirroring handlePreviewPress below.
  async function handleCenterCandidatePress(place: PlaceDetails) {
    if (mode === 'pick') {
      setSelectedCenterPlace(place);
      return;
    }
    setError(null);
    try {
      const cached = await cachePlaceHierarchy(place);
      onCancel();
      router.push({ pathname: '/place/[id]', params: { id: cached.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that place.');
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
      setSelectedCenterPlace(null);
      const [lng, lat] = state.properties.center;
      if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
      viewportDebounceRef.current = setTimeout(async () => {
        setIsLoadingCenterPlace(true);
        try {
          setCenterCandidates(await findNearbyPlaces(lat, lng));
        } catch {
          // Best-effort, same reasoning as browse mode's nearby fetch below —
          // a failed lookup shouldn't block the map, the user can still type
          // a search instead.
          setCenterCandidates([]);
        } finally {
          setIsLoadingCenterPlace(false);
          setHasSearchedCenter(true);
        }
      }, VIEWPORT_DEBOUNCE_MS);
      return;
    }

    if (mode !== 'browse') return;
    if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
    const [lng, lat] = state.properties.center;
    viewportDebounceRef.current = setTimeout(async () => {
      findNearbyPlaces(lat, lng)
        .then(setCenterCandidates)
        .catch(() => setCenterCandidates([]));

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
          <Camera
            ref={cameraRef}
            defaultSettings={{
              zoomLevel: initialCenter ? SELECTED_ZOOM : DEFAULT_ZOOM,
              centerCoordinate: initialCenter ? [initialCenter.lng, initialCenter.lat] : undefined,
            }}
          />
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
            gestures. Available in both modes — browse mode uses it to jump
            straight to a place page instead of a pick/confirm flow. */}
        <View style={styles.centerPinWrap} pointerEvents="none">
          <View style={styles.centerPinDot} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[
            styles.overlay,
            { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.three },
          ]}
          pointerEvents="box-none">
          {/* Back button + search bar + results grouped in one flex:1 View
              so the overlay's own justifyContent:'space-between' only
              separates two things — this top group vs. the confirm bar —
              instead of also prying these apart from each other. */}
          <View style={styles.topSection} pointerEvents="box-none">
          <Pressable onPress={onCancel} hitSlop={8} style={styles.backButton}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>

          <View style={styles.searchBar}>
            <TextField
              placeholder="Search for a place"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
              style={styles.input}
            />
          </View>

          {/* A plain, content-sized View — deliberately NOT a ScrollView
              anymore. Any scroll container here is a drag-capturing
              region: wherever its bounds exceed its actual content it
              becomes a dead zone that neither scrolls (nothing to scroll)
              nor lets the map pan underneath, and sizing those bounds to
              always match the content exactly turned out to be the thing
              that kept not quite working. Capping the list at
              MAX_VISIBLE_RESULTS instead removes the need to scroll at
              all, so this box is always exactly as tall as the rows it
              actually renders and every pixel outside it belongs to the
              map. box-none so the gaps *between* result groups pass
              through too; the rows themselves still take their taps. */}
          <View pointerEvents="box-none">
            {suggestions.length === 0 && !selectedDetails && !selectedCenterPlace && !previewPlaceId && (
              <ThemedText type="small" themeColor="text" style={styles.hintText}>
                Drag the map to find nearby places
              </ThemedText>
            )}

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
                {suggestions.slice(0, MAX_VISIBLE_RESULTS).map((s) => (
                  <Pressable key={s.placeId} onPress={() => handleSuggestionSelect(s)} style={styles.suggestionRow}>
                    <ThemedText type="small">{s.primaryText}</ThemedText>
                    {s.secondaryText && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {s.secondaryText}
                      </ThemedText>
                    )}
                  </Pressable>
                ))}
              </ThemedView>
            )}

            {mode === 'pick' && !selectedDetails && !selectedCenterPlace && centerCandidates.length > 0 && (
              <ThemedView type="backgroundElement" style={styles.suggestions}>
                {centerCandidates.slice(0, MAX_VISIBLE_RESULTS).map((place) => (
                  <Pressable
                    key={place.id}
                    onPress={() => handleCenterCandidatePress(place)}
                    style={styles.suggestionRow}>
                    <ThemedText type="small">{place.displayName}</ThemedText>
                    {getLocalityName(place) && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {getLocalityName(place)}
                      </ThemedText>
                    )}
                  </Pressable>
                ))}
              </ThemedView>
            )}
            {mode === 'pick' &&
              !selectedDetails &&
              !selectedCenterPlace &&
              centerCandidates.length === 0 &&
              isLoadingCenterPlace && (
                <ThemedView type="backgroundElement" style={styles.messageBox}>
                  <ThemedText type="small">Looking here…</ThemedText>
                </ThemedView>
              )}
            {mode === 'pick' &&
              !selectedDetails &&
              !selectedCenterPlace &&
              centerCandidates.length === 0 &&
              !isLoadingCenterPlace &&
              hasSearchedCenter && (
                <ThemedView type="backgroundElement" style={styles.messageBox}>
                  <ThemedText type="small" themeColor="textSecondary">
                    No named place here — try dragging a bit or search instead.
                  </ThemedText>
                </ThemedView>
              )}

            {mode === 'browse' && !previewPlaceId && centerCandidates.length > 0 && (
              <ThemedView type="backgroundElement" style={styles.suggestions}>
                {centerCandidates.slice(0, MAX_VISIBLE_RESULTS).map((place) => (
                  <Pressable
                    key={place.id}
                    onPress={() => handleCenterCandidatePress(place)}
                    style={styles.suggestionRow}>
                    <ThemedText type="small">{place.displayName}</ThemedText>
                    {getLocalityName(place) && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {getLocalityName(place)}
                      </ThemedText>
                    )}
                  </Pressable>
                ))}
              </ThemedView>
            )}
          </View>
          </View>

          {mode === 'pick' && (selectedDetails || selectedCenterPlace) && (
            <View style={styles.confirmBar}>
              <Button
                label={`Use ${(selectedDetails ?? selectedCenterPlace)!.displayName}`}
                onPress={handleConfirm}
                loading={isConfirming}
              />
            </View>
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
  // Everything above the confirm bar (back button, search bar, results).
  // flex:1 makes this span the whole area down to the confirm bar, which
  // is why the JSX pairs it with pointerEvents="box-none": without that,
  // this transparent, mostly-empty View is a plain `auto` view spanning
  // most of the screen, so it swallows every touch that lands in its
  // empty space — blocking map panning nearly everywhere (the overlay
  // above it already sets box-none for exactly this reason; this View
  // needs its own). Its real children (back button, search bar, results
  // scroll) still receive touches normally under box-none.
  topSection: {
    flex: 1,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
    backgroundColor: Colors.backgroundElement,
  },
  searchBar: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  input: {
    flex: 1,
  },
  messageBox: {
    marginTop: Spacing.two,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  hintText: {
    marginTop: Spacing.two,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  suggestions: {
    marginTop: Spacing.three,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: Spacing.half,
  },
  // Extra breathing room above the bare safe-area inset already applied to
  // the KeyboardAvoidingView — without this the button sits right at the
  // legal minimum above the home-indicator, which reads as "too low" on
  // real iOS devices even though nothing is technically obstructing it.
  confirmBar: {
    gap: Spacing.two,
    marginBottom: Spacing.three,
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
