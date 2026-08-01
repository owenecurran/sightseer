import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProfileMapModal } from '@/components/profile-map-modal';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import {
  COUNTRY_FILL,
  COUNTRY_FILL_OPACITY,
  COUNTRY_LINE,
  NATIONAL_PARK_COLOR,
  parseDefaultLayers,
  STATE_FILL,
  STATE_FILL_OPACITY,
  STATE_LINE,
} from '@/lib/map-layers';
import { getVisitedPlacesWithCategory, getVisitedRegions, type VisitedRegion } from '@/lib/profile-map';

type ProfileMapProps = {
  userId: string;
  defaultLayers?: string[];
  isOwnProfile?: boolean;
};

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
export function ProfileMap({ userId, defaultLayers, isOwnProfile }: ProfileMapProps) {
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof getVisitedPlacesWithCategory>> | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<View>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const layers = parseDefaultLayers(defaultLayers);

  useEffect(() => {
    getVisitedPlacesWithCategory(userId)
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, [userId]);

  useEffect(() => {
    if (!places || places.length === 0) return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const centerLng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
    const centerLat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;

    const map = new mapboxgl.Map({
      container: node,
      style: STYLE_URL,
      center: [centerLng, centerLat],
      zoom: DEFAULT_ZOOM,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, userId, defaultLayers]);

  if (!places || places.length === 0) return null;

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        📍 {places.length} place{places.length === 1 ? '' : 's'} visited — tap to explore
      </ThemedText>
      <Pressable onPress={() => setIsExpanded(true)}>
        <View ref={containerRef} style={styles.map} pointerEvents="none" />
      </Pressable>
      <ProfileMapModal
        visible={isExpanded}
        onClose={() => setIsExpanded(false)}
        userId={userId}
        defaultLayers={defaultLayers}
        isOwnProfile={isOwnProfile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  map: {
    width: '100%',
    height: MAP_HEIGHT,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
});
