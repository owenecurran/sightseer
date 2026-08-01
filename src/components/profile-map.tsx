import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProfileMapModal } from '@/components/profile-map-modal';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getVisitedPlaces, type VisitedPlace } from '@/lib/profile-map';

type ProfileMapProps = {
  userId: string;
};

const MAP_HEIGHT = 220;
const DEFAULT_ZOOM = 2;
const STYLE_URL = 'mapbox://styles/mapbox/dark-v10';

// Real embedded mapbox-gl-js map now instead of a text-only summary —
// expo-maps had zero web support, but mapbox-gl is already a dependency
// (from the location picker work), so web gets the same product as native
// instead of a lesser fallback. Non-interactive (no drag/scroll/zoom) since
// this is just a preview — tap opens ProfileMapModal for the real thing.
export function ProfileMap({ userId }: ProfileMapProps) {
  const [places, setPlaces] = useState<VisitedPlace[] | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<View>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    getVisitedPlaces(userId)
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
    const markers = places.map((p) => new mapboxgl.Marker({ color: '#a0bd91' }).setLngLat([p.lng, p.lat]).addTo(map));

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
      resizeObserver.disconnect();
      markers.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [places]);

  if (!places || places.length === 0) return null;

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        📍 {places.length} place{places.length === 1 ? '' : 's'} visited — tap to explore
      </ThemedText>
      <Pressable onPress={() => setIsExpanded(true)}>
        <View ref={containerRef} style={styles.map} pointerEvents="none" />
      </Pressable>
      <ProfileMapModal visible={isExpanded} onClose={() => setIsExpanded(false)} userId={userId} />
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
