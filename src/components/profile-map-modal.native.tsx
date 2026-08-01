import { Camera, FillLayer, LineLayer, MapView, PointAnnotation, ShapeSource } from '@rnmapbox/maps';
import type { FeatureCollection, Polygon } from 'geojson';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MAPBOX_STYLE_URL } from '@/constants/mapbox.native';
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

const DEFAULT_ZOOM = 3;
// Plain 6-digit hex + separate opacity, not 8-digit RGBA-in-hex — see
// profile-map-modal.tsx's matching comment: mapbox-gl-js (web) rejects that
// format outright, @rnmapbox/maps didn't error but this stays consistent
// with the web version rather than silently diverging.
const COUNTRY_FILL = '#1E88E5';
const COUNTRY_FILL_OPACITY = 0.2;
const COUNTRY_LINE = '#1E88E5';
const STATE_FILL = '#F4511E';
const STATE_FILL_OPACITY = 0.2;
const STATE_LINE = '#F4511E';

function regionsToFeatureCollection(regions: VisitedRegion[]): FeatureCollection<Polygon> {
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

// Full-screen expansion of the profile-map preview (ProfileMap in
// profile-map.native.tsx) — toggleable layers instead of the preview's
// fixed "pins only" look. `pins`/`national_parks` are independent,
// overlappable highlights (not mutually exclusive with each other or with
// the region fills), matching "customize what's being highlighted" rather
// than a single-select filter.
export function ProfileMapModal({ visible, onClose, userId }: ProfileMapModalProps) {
  const [activeLayers, setActiveLayers] = useState<Set<LayerKey>>(() => new Set(['pins']));
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof getVisitedPlacesWithCategory>>>([]);
  const [regions, setRegions] = useState<VisitedRegion[]>([]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    getVisitedPlacesWithCategory(userId)
      .then(setPlaces)
      .catch(() => setPlaces([]));
    getVisitedRegions(userId)
      .then(setRegions)
      .catch(() => setRegions([]));
  }, [visible, userId]);

  function toggleLayer(key: LayerKey) {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const centerCoordinate: [number, number] | undefined =
    places.length > 0
      ? [
          places.reduce((sum, p) => sum + p.lng, 0) / places.length,
          places.reduce((sum, p) => sum + p.lat, 0) / places.length,
        ]
      : undefined;

  const nationalParks = places.filter((p) => p.category === 'national_park');
  const countryFeatures = regionsToFeatureCollection(regions.filter((r) => r.level === 'country'));
  const stateFeatures = regionsToFeatureCollection(regions.filter((r) => r.level === 'admin_area_1'));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <MapView style={styles.map} styleURL={MAPBOX_STYLE_URL} scaleBarEnabled={false}>
          <Camera defaultSettings={{ centerCoordinate, zoomLevel: DEFAULT_ZOOM }} />

          {activeLayers.has('countries') && (
            <ShapeSource id="countries-source" shape={countryFeatures}>
              <FillLayer id="countries-fill" style={{ fillColor: COUNTRY_FILL, fillOpacity: COUNTRY_FILL_OPACITY }} />
              <LineLayer id="countries-line" style={{ lineColor: COUNTRY_LINE, lineWidth: 2 }} />
            </ShapeSource>
          )}
          {activeLayers.has('states') && (
            <ShapeSource id="states-source" shape={stateFeatures}>
              <FillLayer id="states-fill" style={{ fillColor: STATE_FILL, fillOpacity: STATE_FILL_OPACITY }} />
              <LineLayer id="states-line" style={{ lineColor: STATE_LINE, lineWidth: 2 }} />
            </ShapeSource>
          )}
          {activeLayers.has('pins') &&
            places.map((p) => (
              <PointAnnotation key={p.id} id={p.id} coordinate={[p.lng, p.lat]}>
                <View style={styles.pin} />
              </PointAnnotation>
            ))}
          {activeLayers.has('national_parks') &&
            nationalParks.map((p) => (
              <PointAnnotation key={`np-${p.id}`} id={`np-${p.id}`} coordinate={[p.lng, p.lat]}>
                <View style={styles.nationalParkPin} />
              </PointAnnotation>
            ))}
        </MapView>

        <View
          style={[styles.overlay, { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.three }]}
          pointerEvents="box-none">
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
  map: {
    ...StyleSheet.absoluteFill,
  },
  overlay: {
    flex: 1,
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
  pin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: BrandColors.sage,
    borderWidth: 2,
    borderColor: BrandColors.cream,
  },
  nationalParkPin: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: '#2E7D32',
    borderWidth: 2,
    borderColor: BrandColors.cream,
  },
});
