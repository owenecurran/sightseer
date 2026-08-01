import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import type { BoardVisitItem } from '@/lib/boards';

type MapViewProps = {
  items: BoardVisitItem[];
};

const WORLD_ZOOM = 3;
// Matches location-search-modal's SELECTED_ZOOM — the "zoomed into one
// specific place" level, used when there's only a single pin to show
// (fitBounds has nothing to fit against a single point).
const SINGLE_PIN_ZOOM = 13;
const BOUNDS_PADDING = 48;
const STYLE_URL = 'mapbox://styles/mapbox/dark-v10';

mapboxgl.accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

// Web counterpart to map-view.native.tsx — same bounds-fit-to-pins
// behavior via mapbox-gl-js's own fitBounds instead of rnmapbox's Camera.
export function BoardMapView({ items }: MapViewProps) {
  const containerRef = useRef<View>(null);

  const places = new Map<string, { lat: number; lng: number; visitId: string }>();
  for (const item of items) {
    if (item.placeLat == null || item.placeLng == null) continue;
    const key = `${item.placeLat},${item.placeLng}`;
    if (!places.has(key)) places.set(key, { lat: item.placeLat, lng: item.placeLng, visitId: item.visitId });
  }
  const pins = [...places.values()];

  useEffect(() => {
    if (pins.length === 0) return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const map = new mapboxgl.Map({
      container: node,
      style: STYLE_URL,
      center: [pins[0].lng, pins[0].lat],
      zoom: pins.length === 1 ? SINGLE_PIN_ZOOM : WORLD_ZOOM,
    });

    const markers = pins.map((pin) => {
      const marker = new mapboxgl.Marker({ color: BrandColors.sage })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      marker.getElement().addEventListener('click', () => {
        router.push({ pathname: '/visit/[id]', params: { id: pin.visitId } });
      });
      return marker;
    });

    if (pins.length > 1) {
      const bounds = pins.reduce(
        (acc, pin) => acc.extend([pin.lng, pin.lat]),
        new mapboxgl.LngLatBounds([pins[0].lng, pins[0].lat], [pins[0].lng, pins[0].lat])
      );
      map.fitBounds(bounds, { padding: BOUNDS_PADDING, animate: false });
    }

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (pins.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          None of these reviews have a mappable location yet.
        </ThemedText>
      </View>
    );
  }

  return <View ref={containerRef} style={styles.map} />;
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
