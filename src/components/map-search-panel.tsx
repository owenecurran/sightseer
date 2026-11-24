import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NearbyPlacePreviewCard } from '@/components/nearby-place-preview-card';
import { ThemedText } from '@/components/themed-text';
import { BackLink } from '@/components/ui/back-link';
import { CircledTabs } from '@/components/ui/circled-tabs';
import { PaperPanel } from '@/components/ui/paper-panel';
import { TagStickerGraphic } from '@/components/ui/tag-sticker-graphic';
import { BrandColors, BrandFonts, Spacing } from '@/constants/theme';
import { resolveViewerLocation } from '@/lib/discover';
import {
  filtersActive,
  MAP_RATING_OPTIONS,
  MAP_REVIEW_OPTIONS,
  NO_MAP_FILTERS,
  searchMapPlaces,
  type MapBounds,
  type MapFilters,
  type MapPlace,
} from '@/lib/map-search';
import { getPlacePreviewReview, type PlacePreview } from '@/lib/nearby-places';
import { colorForRating } from '@/lib/rating-gradient';
import { userErrorMessage } from '@/lib/user-error';
import { listTags, type Tag } from '@/lib/visit-tags';

// Map search, everything but the map itself: what is being searched, what
// came back, the filters, the place picked and its preview, and the panel
// over the map that shows them. Shared by the phone (map-search.native.tsx,
// @rnmapbox/maps) and the web (map-search.tsx, mapbox-gl), which draw the
// map and its pins each their own way and nothing else, so the two cannot
// drift apart.

// How long the map has to sit still before it searches what is in view.
export const SEARCH_DEBOUNCE_MS = 450;
// Where it opens without the viewer's location: wide enough to show a
// country, so there is something to pan from. And how close in with it.
export const DEFAULT_CENTER: [number, number] = [-98, 39];
export const DEFAULT_ZOOM = 3.5;
export const LOCAL_ZOOM = 11;

const RATING_KEYS = MAP_RATING_OPTIONS.map((option) => ({
  key: option.value == null ? 'any' : String(option.value),
  label: option.label,
}));
const REVIEW_KEYS = MAP_REVIEW_OPTIONS.map((option) => ({ key: String(option.value), label: option.label }));
const SORT_KEYS = [
  { key: 'popular', label: 'Most reviewed' },
  { key: 'rating', label: 'Best rated' },
] as const;

export type MapSearchState = ReturnType<typeof useMapSearch>;

export function useMapSearch({ visible, viewerId, onClose }: { visible: boolean; viewerId: string; onClose: () => void }) {
  // Where to open: the viewer's location if it is already known (never
  // asked for here, see resolveViewerLocation), else a wide view. `ready`
  // once that is settled, so the map opens in the right place first time.
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [ready, setReady] = useState(false);
  const [bounds, setBoundsNow] = useState<MapBounds | null>(null);
  const [filters, setFilters] = useState<MapFilters>(NO_MAP_FILTERS);
  // The last search's answer, labelled with what it was a search for, so
  // whether one is in flight is worked out rather than flagged: the search
  // for the current view and filters has not answered while its key differs.
  const [result, setResult] = useState<{ key: string; places: MapPlace[]; error: string | null } | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [preview, setPreview] = useState<PlacePreview | null>(null);
  const [areFiltersOpen, setAreFiltersOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible || ready) return;
    let cancelled = false;
    resolveViewerLocation(viewerId)
      .then((location) => {
        if (cancelled) return;
        if (location) setCenter([location.lng, location.lat]);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, ready, viewerId]);

  useEffect(() => {
    if (!visible || tags.length > 0) return;
    listTags()
      .then(setTags)
      .catch(() => {});
  }, [visible, tags.length]);

  // Searches what is in view whenever the view or the filters change. A
  // slower answer to an earlier view is dropped (the stale flag), as Search
  // drops one for an earlier query.
  const searchKey = bounds ? JSON.stringify([bounds, filters]) : null;
  useEffect(() => {
    if (!visible || !bounds || searchKey == null) return;
    let stale = false;
    searchMapPlaces(bounds, filters)
      .then((found) => {
        if (!stale) setResult({ key: searchKey, places: found, error: null });
      })
      .catch((err) => {
        if (!stale) {
          setResult((current) => ({
            key: searchKey,
            // The pins already up stay up: they are still true of the
            // places they mark.
            places: current?.places ?? [],
            error: userErrorMessage(err, 'Could not search the map just now.'),
          }));
        }
      });
    return () => {
      stale = true;
    };
  }, [visible, bounds, filters, searchKey]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Called by the map each time it comes to rest; searches once it has been
  // still for SEARCH_DEBOUNCE_MS.
  const setBounds = useCallback((next: MapBounds) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setBoundsNow(next), SEARCH_DEBOUNCE_MS);
  }, []);

  const select = useCallback(async (place: MapPlace) => {
    setSelected(place);
    setPreview(null);
    try {
      const found = await getPlacePreviewReview(place.id);
      setPreview(found);
    } catch {
      // The panel still shows the place's own name and numbers.
    }
  }, []);

  const clearSelection = useCallback(() => setSelected(null), []);

  const openPlace = useCallback(
    (placeId: string) => {
      onClose();
      router.push({ pathname: '/place/[id]', params: { id: placeId } });
    },
    [onClose],
  );

  const toggleTag = useCallback((slug: string) => {
    setFilters((current) => ({
      ...current,
      tagSlugs: current.tagSlugs.includes(slug)
        ? current.tagSlugs.filter((s) => s !== slug)
        : [...current.tagSlugs, slug],
    }));
  }, []);

  const places = useMemo(() => result?.places ?? [], [result]);
  const isSearching = searchKey != null && result?.key !== searchKey;
  const error = result?.key === searchKey ? (result?.error ?? null) : null;
  const narrowed = filtersActive(filters);
  const countLine = !bounds
    ? 'Finding places…'
    : isSearching && places.length === 0
      ? 'Searching…'
      : // Not after a failed search: it found nothing only because it did not run.
        error
        ? 'Move the map to try again.'
        : places.length === 0
          ? narrowed
            ? 'Nothing here matches these filters.'
            : 'No reviewed places in view.'
          : `${places.length} place${places.length === 1 ? '' : 's'} in view`;

  return {
    center,
    ready,
    setBounds,
    filters,
    setFilters,
    places,
    error,
    tags,
    selected,
    select,
    clearSelection,
    preview,
    openPlace,
    toggleTag,
    narrowed,
    countLine,
    areFiltersOpen,
    setAreFiltersOpen,
  };
}

// A pin's look, shared so the phone's view and the web's DOM element match:
// the place's average on a disc of the rating's own colour (the scale the
// stamps use), ringed in cream; or, for a place with no rated review, a
// cream dot ringed in sage, the old browse map's pin.
export function pinLook(place: MapPlace): { label: string | null; fill: string; ring: string } {
  if (place.avgRating == null) return { label: null, fill: BrandColors.cream, ring: BrandColors.sage };
  return { label: place.avgRating.toFixed(1), fill: colorForRating(place.avgRating), ring: BrandColors.cream };
}

// Everything over the map: Close, the picked place's preview, and the panel
// with the count and the filters.
export function MapSearchOverlay({ search, onClose }: { search: MapSearchState; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { filters, setFilters, selected, preview } = search;

  return (
    <View
      style={[styles.overlay, { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.three }]}
      pointerEvents="box-none">
      <View style={styles.top} pointerEvents="box-none">
        <View style={styles.backWash}>
          <BackLink label="Close" onPress={onClose} seed="map-search" />
        </View>
      </View>

      <View pointerEvents="box-none" style={styles.bottom}>
        {selected && (
          <View style={styles.previewWrap}>
            {preview ? (
              <NearbyPlacePreviewCard preview={preview} onPress={() => search.openPlace(selected.id)} />
            ) : (
              <Pressable onPress={() => search.openPlace(selected.id)}>
                <PaperPanel seed={`map-${selected.id}`} style={styles.selectedPanel}>
                  <ThemedText type="headlineWrapped" numberOfLines={2}>
                    {selected.name}
                  </ThemedText>
                  <ThemedText type="meta">
                    {selected.avgRating != null ? `${selected.avgRating.toFixed(1)} average · ` : ''}
                    {selected.reviewCount} review{selected.reviewCount === 1 ? '' : 's'}
                  </ThemedText>
                </PaperPanel>
              </Pressable>
            )}
          </View>
        )}

        <PaperPanel seed="map-search-controls" style={styles.panel}>
          <View style={styles.panelHead}>
            <View style={styles.panelHeadText}>
              <ThemedText type="sectionLabel">Search the map</ThemedText>
              <ThemedText type="caption">{search.countLine}</ThemedText>
            </View>
            <ThemedText type="action" themeColor="sage" onPress={() => search.setAreFiltersOpen((open) => !open)}>
              {search.areFiltersOpen ? 'Done' : search.narrowed ? 'Filters on' : 'Filters'}
            </ThemedText>
          </View>
          {search.error && (
            <ThemedText type="small" themeColor="danger">
              {search.error}
            </ThemedText>
          )}

          {search.areFiltersOpen && (
            <ScrollView style={styles.filters} contentContainerStyle={styles.filtersContent} showsVerticalScrollIndicator={false}>
              <View style={styles.filterGroup}>
                <ThemedText type="meta">Rating</ThemedText>
                <CircledTabs
                  items={RATING_KEYS}
                  active={filters.minRating == null ? 'any' : String(filters.minRating)}
                  onChange={(key) => setFilters((current) => ({ ...current, minRating: key === 'any' ? null : Number(key) }))}
                  role="radio"
                />
              </View>
              <View style={styles.filterGroup}>
                <ThemedText type="meta">Popularity</ThemedText>
                <CircledTabs
                  items={REVIEW_KEYS}
                  active={String(filters.minReviews)}
                  onChange={(key) => setFilters((current) => ({ ...current, minReviews: Number(key) }))}
                  role="radio"
                />
              </View>
              <View style={styles.filterGroup}>
                <ThemedText type="meta">Show first</ThemedText>
                <CircledTabs
                  items={SORT_KEYS}
                  active={filters.sort}
                  onChange={(key) => setFilters((current) => ({ ...current, sort: key }))}
                  role="radio"
                />
              </View>
              {search.tags.length > 0 && (
                <View style={styles.filterGroup}>
                  <ThemedText type="meta">Tags</ThemedText>
                  <View style={styles.tagGrid}>
                    {search.tags.map((tag) => {
                      const on = filters.tagSlugs.includes(tag.slug);
                      return (
                        <Pressable
                          key={tag.slug}
                          onPress={() => search.toggleTag(tag.slug)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={tag.label}
                          style={[styles.tagOption, !on && styles.tagOptionIdle]}>
                          <TagStickerGraphic slug={tag.slug} label={tag.label} size={40} interactive={false} />
                          <Text style={[styles.tagLabel, on && styles.tagLabelOn]} numberOfLines={1}>
                            {tag.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
              {search.narrowed && (
                <ThemedText type="action" onPress={() => setFilters({ ...NO_MAP_FILTERS, sort: filters.sort })}>
                  Clear filters
                </ThemedText>
              )}
            </ScrollView>
          )}
        </PaperPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
  },
  top: {
    flexDirection: 'row',
  },
  // A dark wash behind the word only, so it stays legible over pale ground,
  // as on the profile map.
  backWash: {
    paddingVertical: Spacing.one,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.three,
    borderRadius: Spacing.five,
    backgroundColor: 'rgba(5, 15, 10, 0.55)',
  },
  bottom: {
    gap: Spacing.two,
    // On a wide browser window the panel would otherwise stretch the width
    // of the screen; the phone never reaches this.
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  previewWrap: {
    alignSelf: 'stretch',
  },
  selectedPanel: {
    gap: Spacing.half,
  },
  panel: {
    gap: Spacing.two,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  panelHeadText: {
    flex: 1,
    gap: Spacing.half,
  },
  // Room either side for a ring's reach past its word: a scroll view clips
  // what lies outside it, and the first word's ring lost its left edge.
  filters: {
    maxHeight: 340,
    marginHorizontal: -Spacing.two,
  },
  filtersContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  filterGroup: {
    gap: Spacing.one,
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tagOption: {
    width: '30%',
    alignItems: 'center',
    gap: 2,
  },
  // The tags not chosen sit back, as CardChoice fades the cards not chosen.
  tagOptionIdle: {
    opacity: 0.45,
  },
  tagLabel: {
    fontFamily: BrandFonts.hand,
    fontSize: 14,
    color: 'rgba(234, 231, 207, 0.7)',
  },
  tagLabelOn: {
    color: BrandColors.cream,
  },
});
