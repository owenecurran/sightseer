import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NearbyPlacePreviewCard } from '@/components/nearby-place-preview-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, Colors, Spacing } from '@/constants/theme';
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
  // Optional/unused in 'browse' mode — see location-search-modal.native.tsx's
  // matching prop comment, this file mirrors that one's mode split.
  onSelect?: (place: PlaceRow) => void;
  mode?: 'pick' | 'browse';
};

const DEBOUNCE_MS = 300;
const DEFAULT_ZOOM = 2;
const SELECTED_ZOOM = 13;
const CURRENT_LOCATION_ZOOM = 14;
const VIEWPORT_DEBOUNCE_MS = 500;
// Same style URL as location-search-modal.native.tsx's MAPBOX_STYLE_URL
// (Mapbox.StyleURL.Dark resolves to this exact string) — kept as a literal
// here rather than shared, since mapbox-gl-js and @rnmapbox/maps are two
// unrelated SDKs with nothing else in common to warrant one shared constants
// file, and @rnmapbox/maps has no web build to import it from anyway.
const STYLE_URL = 'mapbox://styles/mapbox/dark-v10';

mapboxgl.accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
if (!mapboxgl.accessToken) {
  console.warn('Missing EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN — Mapbox tiles will not load.');
}

// Real interactive map on web too, via mapbox-gl-js directly — a separate
// SDK from @rnmapbox/maps (which has no web renderer at all), but the same
// underlying Mapbox styles/tiles, so this reads as the same product as the
// native picker. Mirrors location-search-modal.native.tsx's structure
// (search → fetch details → animate camera → drop marker → confirm) closely
// enough that the two files should be read/changed together.
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
  // Uber-style "drag the map to name an unmarked spot" — both modes now (see
  // the matching state/comment in location-search-modal.native.tsx).
  const [centerCandidates, setCenterCandidates] = useState<PlaceDetails[]>([]);
  const [selectedCenterPlace, setSelectedCenterPlace] = useState<PlaceDetails | null>(null);
  const [isLoadingCenterPlace, setIsLoadingCenterPlace] = useState(false);
  const [hasSearchedCenter, setHasSearchedCenter] = useState(false);

  const sessionTokenRef = useRef(createPlacesSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<View>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const nearbyMarkersRef = useRef<mapboxgl.Marker[]>([]);
  // Set right before any camera move this component itself triggers — see
  // the matching ref/comment in location-search-modal.native.tsx.
  const isProgrammaticMoveRef = useRef(false);

  // Created only while the modal is actually visible (not on first mount of
  // a hidden Modal) — mapbox-gl-js measures its container's real pixel size
  // at creation time, and a Modal's content can be laid out at zero size
  // while hidden. Torn down on close so reopening always gets a fresh map
  // (and a fresh current-location fetch, matching the native picker).
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

    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const map = new mapboxgl.Map({
      container: node,
      style: STYLE_URL,
      center: [0, 20],
      zoom: DEFAULT_ZOOM,
    });
    mapRef.current = map;

    // mapbox-gl-js measures its container's pixel size once at construction
    // and doesn't automatically notice later layout changes — since `node`
    // sits inside a flex layout that can still be settling (RN Modal content
    // + a Fast Refresh reflow) at that exact moment, the map can end up
    // permanently believing it's 0×0 even after the container visibly
    // reaches its real size (confirmed via computed styles: canvas painted
    // fully transparent despite correct final container dimensions). A
    // ResizeObserver + explicit resize() call is the standard fix for
    // embedding mapbox-gl-js in a dynamic/flex layout rather than a fixed
    // page region — but resize() is genuinely expensive (it reallocates the
    // WebGL drawing buffer), and ResizeObserver can fire many times in quick
    // succession for unrelated reasons (e.g. the suggestions list mounting
    // changes sibling layout). Guarding on the size actually changing avoids
    // hammering resize() redundantly, which was visibly corrupting rendering
    // (a blank/gray canvas) during rapid interaction in testing.
    let lastSize = '';
    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const size = `${width}x${height}`;
      if (size === lastSize) return;
      lastSize = size;
      map.resize();
    });
    resizeObserver.observe(node);

    map.on('error', (e) => console.warn('Mapbox error:', e.error?.message ?? e));

    if (mode === 'browse') {
      map.on('moveend', () => {
        if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
        viewportDebounceRef.current = setTimeout(async () => {
          const { lng, lat } = map.getCenter();
          findNearbyPlaces(lat, lng)
            .then(setCenterCandidates)
            .catch(() => setCenterCandidates([]));

          const bounds = map.getBounds();
          if (!bounds) return;
          try {
            setNearbyPlaces(
              await getNearbyReviewedPlaces({
                minLng: bounds.getWest(),
                minLat: bounds.getSouth(),
                maxLng: bounds.getEast(),
                maxLat: bounds.getNorth(),
              })
            );
          } catch {
            // Best-effort, same reasoning as the native picker's
            // handleMapIdle — a failed fetch shouldn't block the map.
          }
        }, VIEWPORT_DEBOUNCE_MS);
      });
    }

    if (mode === 'pick') {
      map.on('moveend', () => {
        // A camera move this component itself triggered already knows what
        // place it's centered on — see the matching comment in
        // location-search-modal.native.tsx's handleMapIdle.
        if (isProgrammaticMoveRef.current) {
          isProgrammaticMoveRef.current = false;
          return;
        }
        setSelectedDetails(null);
        setSelectedCenterPlace(null);
        markerRef.current?.remove();
        markerRef.current = null;
        const { lng, lat } = map.getCenter();
        if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
        viewportDebounceRef.current = setTimeout(async () => {
          setIsLoadingCenterPlace(true);
          try {
            setCenterCandidates(await findNearbyPlaces(lat, lng));
          } catch {
            setCenterCandidates([]);
          } finally {
            setIsLoadingCenterPlace(false);
            setHasSearchedCenter(true);
          }
        }, VIEWPORT_DEBOUNCE_MS);
      });
    }

    let cancelled = false;
    getCurrentLocation().then((coords) => {
      if (cancelled || !coords) return;
      isProgrammaticMoveRef.current = true;
      map.flyTo({ center: [coords.lng, coords.lat], zoom: CURRENT_LOCATION_ZOOM });
    });

    return () => {
      cancelled = true;
      if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
      resizeObserver.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      // Not individually .remove()'d — map.remove() below tears down the
      // whole map DOM tree (including any markers still attached to it) in
      // one shot; this ref just needs resetting so a reopened modal doesn't
      // hold stale Marker instances pointing at an already-removed map.
      nearbyMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
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

  // Imperatively syncs mapbox-gl-js Marker instances to nearbyPlaces state —
  // markers aren't declarative JSX the way @rnmapbox/maps' PointAnnotation
  // is, so this replaces the whole marker set on every fetch rather than
  // diffing. Fine at this scale (capped ~60 results per viewport query).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'browse') return;

    nearbyMarkersRef.current.forEach((m) => m.remove());
    nearbyMarkersRef.current = nearbyPlaces.map((place) => {
      const marker = new mapboxgl.Marker({ color: BrandColors.cream })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
      marker.getElement().addEventListener('click', () => handleNearbyMarkerPress(place));
      return marker;
    });

    return () => {
      nearbyMarkersRef.current.forEach((m) => m.remove());
      nearbyMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyPlaces]);

  async function handleSuggestionSelect(suggestion: PlaceAutocompleteSuggestion) {
    setError(null);
    try {
      const details = await fetchPlaceDetails(suggestion.placeId, sessionTokenRef.current);
      setSuggestions([]);
      const map = mapRef.current;
      if (map) {
        isProgrammaticMoveRef.current = true;
        map.flyTo({ center: [details.lng, details.lat], zoom: SELECTED_ZOOM });
        if (mode === 'pick') {
          setSelectedDetails(details);
          setCenterCandidates([]);
          setSelectedCenterPlace(null);
          markerRef.current?.remove();
          markerRef.current = new mapboxgl.Marker({ color: BrandColors.sage })
            .setLngLat([details.lng, details.lat])
            .addTo(map);
        }
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
  // confirm-bar target. browse mode jumps straight to that place's page,
  // mirroring handlePreviewPress above.
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View ref={containerRef} style={styles.map} />

        {/* Uber-style fixed center pin — see the matching comment in
            location-search-modal.native.tsx. Available in both modes. */}
        <View style={styles.centerPinWrap} pointerEvents="none">
          <View style={styles.centerPinDot} />
        </View>

        <View style={styles.overlay} pointerEvents="box-none">
          {/* Back button + the scrollable search/results are grouped in one
              plain View so the overlay's own justifyContent:'space-between'
              still only separates two things — this top group vs. the
              confirm bar — instead of also prying the back button and
              ScrollView apart from each other (which pushed the ScrollView
              down toward the middle/bottom of the screen when no confirm bar
              was rendered to fill the third slot). */}
          <View>
            {/* Back button lives outside the scroll region — always
                reachable regardless of how far the results list has
                scrolled, unlike the search bar/results below it (see
                resultsScroll's own comment for why those scroll away). */}
            <Pressable onPress={onCancel} hitSlop={8} style={styles.backButton}>
              <ThemedText type="link">← Back</ThemedText>
            </Pressable>

            {/* Search bar + results scroll together, bounded but generous —
                not flex:1 — so the bar can move out of view once there's
                enough content, matching location-search-modal.native.tsx.
                Confirm bar stays outside this scroll, pinned at the bottom. */}
            <ScrollView style={styles.resultsScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.searchBar}>
              <TextField
                placeholder="Search for a place"
                value={query}
                onChangeText={setQuery}
                style={styles.input}
              />
            </View>

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
              </ThemedView>
            )}

            {mode === 'pick' && !selectedDetails && !selectedCenterPlace && centerCandidates.length > 0 && (
              <ThemedView type="backgroundElement" style={styles.suggestions}>
                {centerCandidates.map((place) => (
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
                {centerCandidates.map((place) => (
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
          </ScrollView>
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Deliberately NOT position:absolute (unlike `overlay` below) — mapbox-gl-js
  // takes ownership of its container element's own `position` CSS property
  // (forces it to `relative`) as part of mounting, which silently defeats
  // top/left/right/bottom-driven sizing (those only resize position:absolute
  // or fixed elements). flex:1 sizes this view via normal flex layout
  // instead, which mapbox-gl-js's own styling doesn't touch — confirmed via
  // computed styles: this element measured height:0 with absoluteFill (its
  // position had silently become 'relative', explaining a fully blank map),
  // fixed by switching to flex sizing here and moving the overlay (which
  // React fully controls, untouched by mapbox-gl-js) to be the absolutely
  // positioned layer instead.
  map: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  centerPinWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BrandColors.sage,
    borderWidth: 3,
    borderColor: BrandColors.cream,
    transform: [{ translateY: -10 }],
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
    backgroundColor: Colors.backgroundElement,
  },
  // Bounded but generous — not flex:1 — matches
  // location-search-modal.native.tsx's resultsScroll.
  resultsScroll: {
    maxHeight: '65%',
  },
  searchBar: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
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
    marginTop: Spacing.two,
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
});
