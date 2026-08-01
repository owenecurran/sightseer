import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Spacing } from '@/constants/theme';
import { getVisitedPlacesWithCategory, getVisitedRegions, type VisitedRegion } from '@/lib/profile-map';

type ProfileMapModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string;
};

type LayerKey = 'pins' | 'countries' | 'states' | 'national_parks';

const LAYER_OPTIONS: { key: LayerKey; label: string }[] = [
  { key: 'pins', label: 'Pins' },
  { key: 'countries', label: 'Countries' },
  { key: 'states', label: 'States' },
  { key: 'national_parks', label: 'National Parks' },
];

const DEFAULT_ZOOM = 2;
// Plain 6-digit hex + a separate opacity property, not 8-digit RGBA-in-hex
// (e.g. '#1E88E533') — confirmed live: mapbox-gl-js's style spec validator
// rejects that format outright ("color expected"), unlike React Native's
// own color parser, which tolerates it fine. Kept as separate color/opacity
// pairs on both platforms (not just web) for consistency, even though
// @rnmapbox/maps didn't error on the combined form.
const COUNTRY_FILL = '#1E88E5';
const COUNTRY_FILL_OPACITY = 0.2;
const COUNTRY_LINE = '#1E88E5';
const STATE_FILL = '#F4511E';
const STATE_FILL_OPACITY = 0.2;
const STATE_LINE = '#F4511E';
// Same style URL as location-search-modal.tsx's STYLE_URL — see that file's
// comment for why it's kept as a literal rather than a shared constant.
const STYLE_URL = 'mapbox://styles/mapbox/dark-v10';

mapboxgl.accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

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

// Web equivalent of profile-map-modal.native.tsx — same toggleable-layer
// design, via mapbox-gl-js instead of @rnmapbox/maps (no web build). Mirrors
// location-search-modal.tsx's mapbox-gl-js lifecycle patterns (flex-sized
// container, not absoluteFill; ResizeObserver-driven resize()) closely
// enough the two should be read together if either needs changing.
export function ProfileMapModal({ visible, onClose, userId }: ProfileMapModalProps) {
  const [activeLayers, setActiveLayers] = useState<Set<LayerKey>>(() => new Set(['pins']));
  const containerRef = useRef<View>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!visible) return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const map = new mapboxgl.Map({ container: node, style: STYLE_URL, center: [0, 20], zoom: DEFAULT_ZOOM });
    mapRef.current = map;

    let lastSize = '';
    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const size = `${width}x${height}`;
      if (size === lastSize) return;
      lastSize = size;
      map.resize();
    });
    resizeObserver.observe(node);

    let cancelled = false;
    (async () => {
      const [places, regions] = await Promise.all([
        getVisitedPlacesWithCategory(userId).catch(() => []),
        getVisitedRegions(userId).catch(() => []),
      ]);
      if (cancelled) return;

      if (places.length > 0) {
        const centerLng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
        const centerLat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
        map.setCenter([centerLng, centerLat]);
      }

      function applyLayers(layers: Set<LayerKey>) {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
        if (layers.has('pins')) {
          for (const p of places) {
            markersRef.current.push(new mapboxgl.Marker({ color: BrandColors.sage }).setLngLat([p.lng, p.lat]).addTo(map));
          }
        }
        if (layers.has('national_parks')) {
          for (const p of places.filter((place) => place.category === 'national_park')) {
            markersRef.current.push(new mapboxgl.Marker({ color: '#2E7D32' }).setLngLat([p.lng, p.lat]).addTo(map));
          }
        }

        for (const id of ['countries', 'states']) {
          if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`);
          if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
          if (map.getSource(id)) map.removeSource(id);
        }
        if (layers.has('countries')) {
          const data = regionsToFeatureCollection(regions.filter((r) => r.level === 'country'));
          map.addSource('countries', { type: 'geojson', data });
          map.addLayer({
            id: 'countries-fill',
            type: 'fill',
            source: 'countries',
            paint: { 'fill-color': COUNTRY_FILL, 'fill-opacity': COUNTRY_FILL_OPACITY },
          });
          map.addLayer({
            id: 'countries-line',
            type: 'line',
            source: 'countries',
            paint: { 'line-color': COUNTRY_LINE, 'line-width': 2 },
          });
        }
        if (layers.has('states')) {
          const data = regionsToFeatureCollection(regions.filter((r) => r.level === 'admin_area_1'));
          map.addSource('states', { type: 'geojson', data });
          map.addLayer({
            id: 'states-fill',
            type: 'fill',
            source: 'states',
            paint: { 'fill-color': STATE_FILL, 'fill-opacity': STATE_FILL_OPACITY },
          });
          map.addLayer({
            id: 'states-line',
            type: 'line',
            source: 'states',
            paint: { 'line-color': STATE_LINE, 'line-width': 2 },
          });
        }
      }

      // Re-run whenever the toggle chips change — map.once('style.load') isn't
      // needed here since the map is freshly created and its style loads
      // before any user interaction could toggle a chip, but addSource/Layer
      // still need the style to be ready, hence gating the very first call.
      if (map.isStyleLoaded()) applyLayers(activeLayers);
      else map.once('load', () => applyLayers(activeLayers));

      applyLayersRef.current = applyLayers;
    })();

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      applyLayersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userId]);

  // Holds the latest applyLayers closure (captured places/regions from the
  // effect above) so toggling a chip can re-run it without re-fetching or
  // re-creating the map — a ref because it's an imperative escape hatch, not
  // rendered state.
  const applyLayersRef = useRef<((layers: Set<LayerKey>) => void) | null>(null);

  function toggleLayer(key: LayerKey) {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      applyLayersRef.current?.(next);
      return next;
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View ref={containerRef} style={styles.map} />

        <View style={styles.overlay} pointerEvents="box-none">
          <Pressable onPress={onClose} style={styles.closeButton}>
            <ThemedText type="smallBold" themeColor="background">
              Close
            </ThemedText>
          </Pressable>

          <View style={styles.chipRow}>
            {LAYER_OPTIONS.map((option) => {
              const active = activeLayers.has(option.key);
              return (
                <Pressable key={option.key} onPress={() => toggleLayer(option.key)}>
                  <ThemedView type={active ? 'backgroundSelected' : 'backgroundElement'} style={styles.chip}>
                    <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
                      {option.label}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // flex, not absoluteFill — same reasoning as location-search-modal.tsx's
  // `map` style (mapbox-gl-js overrides `position` on its container).
  map: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  closeButton: {
    alignSelf: 'flex-start',
    backgroundColor: BrandColors.cream,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
});
