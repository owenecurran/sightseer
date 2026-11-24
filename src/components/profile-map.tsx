import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProfileMapModal } from '@/components/profile-map-modal';
import { ThemedText } from '@/components/themed-text';
import { StickerArrow } from '@/components/ui/sticker-arrow';
import { BrandColors, Spacing } from '@/constants/theme';
import {
  CITY_COLOR,
  CITY_RING,
  COUNTRY_FILL,
  COUNTRY_FILL_OPACITY,
  COUNTRY_LINE,
  NATIONAL_PARK_COLOR,
  parseDefaultLayers,
  STATE_FILL,
  STATE_FILL_OPACITY,
  STATE_LINE,
  visitedSummary,
} from '@/lib/map-layers';
import {
  getVisitedHierarchy,
  getVisitedPlacesWithCategory,
  getVisitedRegions,
  type VisitedCity,
  type VisitedHierarchy,
  type VisitedRegion,
} from '@/lib/profile-map';

type ProfileMapProps = {
  userId: string;
  defaultLayers?: string[];
  defaultCamera?: { lat: number; lng: number; zoom: number } | null;
  isOwnProfile?: boolean;
  onCameraLocked?: () => void;
  // After the owner saves which layers it shows (see profile-map.native.tsx).
  onLayersSaved?: () => void;
};

function citiesToFeatureCollection(cities: VisitedCity[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: cities.map((city) => ({
      type: 'Feature' as const,
      id: city.id,
      properties: { name: city.name },
      geometry: { type: 'Point' as const, coordinates: [city.lng, city.lat] },
    })),
  };
}

const MAP_HEIGHT = 220;
const DEFAULT_ZOOM = 2;
const STYLE_URL = 'mapbox://styles/mapbox/dark-v10';

function regionsToFeatureCollection(regions: VisitedRegion[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: regions.flatMap((region) =>
      region.rings.map((ring, index) => ({
        type: 'Feature' as const,
        id: `${region.id}-${index}`,
        properties: { name: region.name },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      }))
    ),
  };
}

// Real embedded mapbox-gl-js map now instead of a text-only summary —
// expo-maps had zero web support, but mapbox-gl is already a dependency
// (from the location picker work), so web gets the same product as native
// instead of a lesser fallback. Non-interactive (no drag/scroll/zoom) since
// this is just a preview — tap opens ProfileMapModal for the real thing.
// Renders whichever layers `defaultLayers` says to show, same layer set as
// the modal — see profile-map.native.tsx's matching comment.
export function ProfileMap({
  userId,
  defaultLayers,
  defaultCamera,
  isOwnProfile,
  onCameraLocked,
  onLayersSaved,
}: ProfileMapProps) {
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof getVisitedPlacesWithCategory>> | null>(null);
  // As on the phone: the cities and the counts, or 'failed' for the caption
  // to fall back on the count of places.
  const [hierarchy, setHierarchy] = useState<VisitedHierarchy | 'failed' | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<View>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const layers = parseDefaultLayers(defaultLayers);

  useEffect(() => {
    getVisitedPlacesWithCategory(userId)
      .then(setPlaces)
      .catch(() => setPlaces([]));
    getVisitedHierarchy(userId)
      .then(setHierarchy)
      .catch(() => setHierarchy('failed'));
  }, [userId]);

  useEffect(() => {
    if (!places || places.length === 0 || hierarchy == null) return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const centerLng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
    const centerLat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;

    const map = new mapboxgl.Map({
      container: node,
      style: STYLE_URL,
      center: defaultCamera ? [defaultCamera.lng, defaultCamera.lat] : [centerLng, centerLat],
      zoom: defaultCamera?.zoom ?? DEFAULT_ZOOM,
      interactive: false,
    });
    mapRef.current = map;
    const markers: mapboxgl.Marker[] = [];
    if (layers.has('pins')) {
      for (const p of places) {
        markers.push(new mapboxgl.Marker({ color: BrandColors.sage }).setLngLat([p.lng, p.lat]).addTo(map));
      }
    }
    if (layers.has('national_parks')) {
      for (const p of places.filter((place) => place.category === 'national_park')) {
        markers.push(new mapboxgl.Marker({ color: NATIONAL_PARK_COLOR }).setLngLat([p.lng, p.lat]).addTo(map));
      }
    }

    let cancelled = false;
    if (layers.has('cities') && hierarchy !== 'failed' && hierarchy.cities.length > 0) {
      const cities = hierarchy.cities;
      const addCities = () => {
        if (cancelled) return;
        map.addSource('cities', { type: 'geojson', data: citiesToFeatureCollection(cities) });
        map.addLayer({
          id: 'cities-dot',
          type: 'circle',
          source: 'cities',
          paint: { 'circle-radius': 5, 'circle-color': CITY_COLOR, 'circle-stroke-color': CITY_RING, 'circle-stroke-width': 2 },
        });
      };
      if (map.isStyleLoaded()) addCities();
      else map.once('load', addCities);
    }
    if (layers.has('countries') || layers.has('states')) {
      getVisitedRegions(userId)
        .then((regions) => {
          if (cancelled) return;
          function addRegionLayer(id: 'countries' | 'states', data: GeoJSON.FeatureCollection<GeoJSON.Polygon>) {
            const fillColor = id === 'countries' ? COUNTRY_FILL : STATE_FILL;
            const fillOpacity = id === 'countries' ? COUNTRY_FILL_OPACITY : STATE_FILL_OPACITY;
            const lineColor = id === 'countries' ? COUNTRY_LINE : STATE_LINE;
            map.addSource(id, { type: 'geojson', data });
            map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': fillColor, 'fill-opacity': fillOpacity } });
            map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': lineColor, 'line-width': 2 } });
          }
          function apply() {
            if (layers.has('countries')) {
              addRegionLayer('countries', regionsToFeatureCollection(regions.filter((r) => r.level === 'country')));
            }
            if (layers.has('states')) {
              addRegionLayer('states', regionsToFeatureCollection(regions.filter((r) => r.level === 'admin_area_1')));
            }
          }
          if (map.isStyleLoaded()) apply();
          else map.once('load', apply);
        })
        .catch(() => {});
    }

    // Same 0×0-at-creation risk location-search-modal.tsx documents in
    // detail — this preview sits inside a ScrollView whose layout can still
    // be settling when the map is constructed.
    let lastSize = '';
    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const size = `${width}x${height}`;
      if (size === lastSize) return;
      lastSize = size;
      map.resize();
    });
    resizeObserver.observe(node);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      markers.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
    // Depend on the locked camera's primitive fields, not the `defaultCamera`
    // object itself (a fresh object every render from parseDefaultCamera())
    // — object-identity deps would rebuild the whole map on every render.
    // A real value change (e.g. right after refreshProfile() picks up a new
    // lock) still needs to rebuild, since mapboxgl.Map's center/zoom are
    // constructor-only here, same "only applies once" limitation as native's
    // Camera defaultSettings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, hierarchy, userId, defaultLayers, defaultCamera?.lat, defaultCamera?.lng, defaultCamera?.zoom]);

  // Both, so the caption does not change under the reader once the counts
  // arrive.
  if (!places || places.length === 0 || hierarchy == null) return null;

  const summary =
    hierarchy === 'failed'
      ? `${places.length} place${places.length === 1 ? '' : 's'}`
      : visitedSummary(
          {
            countries: hierarchy.countries,
            states: hierarchy.states,
            cities: hierarchy.cities.length,
            places: places.length,
          },
          layers,
        );

  return (
    <View style={styles.container}>
      {/* Composed like the other profile sections (see TeaserCard): a
          sectionLabel, the thing itself on the row below, and an arrow
          sticker hanging off the edge to say it opens something.
          
          No separator punctuation. The count and the instruction used to be
          one sentence joined by a dash or a middot, which read as a caption
          rather than as a section — and with the arrow there, "tap to
          explore" was saying in words what the sticker already says. */}
      {/* Opens the map too, as the arrow on it says it does. Only the map
          below took the tap, so the arrow, the one part that looks like a
          button, did nothing. */}
      <Pressable
        onPress={() => setIsExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel="Open the map of places I've been"
        style={({ pressed }) => [styles.captionRow, pressed && styles.captionPressed]}>
        <View style={styles.captionText}>
          <ThemedText type="sectionLabel">Places I&apos;ve been</ThemedText>
          <ThemedText type="default">{summary}</ThemedText>
        </View>
        <View style={styles.stickerHang}>
          <StickerArrow direction="right" seed="profile-map" />
        </View>
      </Pressable>
      <Pressable onPress={() => setIsExpanded(true)}>
        <View ref={containerRef} style={styles.map} pointerEvents="none" />
      </Pressable>
      <ProfileMapModal
        visible={isExpanded}
        onClose={() => setIsExpanded(false)}
        userId={userId}
        defaultLayers={defaultLayers}
        defaultCamera={defaultCamera}
        isOwnProfile={isOwnProfile}
        onCameraLocked={onCameraLocked}
        onLayersSaved={onLayersSaved}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  captionText: {
    flex: 1,
  },
  // Pulled past the panel's own edge so it reads as stuck on rather than
  // tucked in — the same trick TeaserCard uses for its arrow.
  captionPressed: {
    opacity: 0.6,
  },
  stickerHang: {
    alignSelf: 'center',
    marginRight: -Spacing.two,
  },
  map: {
    width: '100%',
    height: MAP_HEIGHT,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
});
