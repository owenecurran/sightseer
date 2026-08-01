import { Camera, FillLayer, LineLayer, MapView, PointAnnotation, ShapeSource, type MapState } from '@rnmapbox/maps';
import type { FeatureCollection, Polygon } from 'geojson';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MAPBOX_STYLE_URL } from '@/constants/mapbox.native';
import { BrandColors, Spacing } from '@/constants/theme';
import {
  COUNTRY_FILL,
  COUNTRY_FILL_OPACITY,
  COUNTRY_LINE,
  LAYER_OPTIONS,
  NATIONAL_PARK_COLOR,
  parseDefaultLayers,
  STATE_FILL,
  STATE_FILL_OPACITY,
  STATE_LINE,
  type LayerKey,
} from '@/lib/map-layers';
import {
  getVisitedPlacesWithCategory,
  getVisitedRegions,
  saveDefaultMapCamera,
  saveDefaultMapLayers,
  type VisitedRegion,
} from '@/lib/profile-map';

type ProfileMapModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string;
  defaultLayers?: string[];
  defaultCamera?: { lat: number; lng: number; zoom: number } | null;
  isOwnProfile?: boolean;
};

const DEFAULT_ZOOM = 3;

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
export function ProfileMapModal({
  visible,
  onClose,
  userId,
  defaultLayers,
  defaultCamera,
  isOwnProfile,
}: ProfileMapModalProps) {
  const [activeLayers, setActiveLayers] = useState<Set<LayerKey>>(() => parseDefaultLayers(defaultLayers));
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof getVisitedPlacesWithCategory>>>([]);
  const [regions, setRegions] = useState<VisitedRegion[]>([]);
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const [isLockingView, setIsLockingView] = useState(false);
  const insets = useSafeAreaInsets();
  // Camera is uncontrolled (defaultSettings-only) — track the latest
  // position via onMapIdle so "Lock this view" can read wherever the user
  // has actually panned/zoomed to, not just the initial centroid.
  const latestCameraRef = useRef<{ lat: number; lng: number; zoom: number } | null>(
    defaultCamera ?? null
  );

  useEffect(() => {
    if (!visible) return;
    // Re-seed from the persisted default each time the modal opens (not just
    // on first mount) — otherwise a save from a previous open would be
    // invisible until the whole screen remounted.
    setActiveLayers(parseDefaultLayers(defaultLayers));
    getVisitedPlacesWithCategory(userId)
      .then(setPlaces)
      .catch(() => setPlaces([]));
    getVisitedRegions(userId)
      .then(setRegions)
      .catch(() => setRegions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userId]);

  async function handleSaveDefault() {
    setIsSavingDefault(true);
    try {
      await saveDefaultMapLayers(userId, Array.from(activeLayers));
    } finally {
      setIsSavingDefault(false);
    }
  }

  async function handleLockView() {
    const camera = latestCameraRef.current;
    if (!camera) return;
    setIsLockingView(true);
    try {
      await saveDefaultMapCamera(userId, { lat: camera.lat, lng: camera.lng }, camera.zoom);
    } finally {
      setIsLockingView(false);
    }
  }

  function handleMapIdle(state: MapState) {
    const [lng, lat] = state.properties.center;
    latestCameraRef.current = { lat, lng, zoom: state.properties.zoom };
  }

  function toggleLayer(key: LayerKey) {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const centerCoordinate: [number, number] | undefined = defaultCamera
    ? [defaultCamera.lng, defaultCamera.lat]
    : places.length > 0
      ? [
          places.reduce((sum, p) => sum + p.lng, 0) / places.length,
          places.reduce((sum, p) => sum + p.lat, 0) / places.length,
        ]
      : undefined;
  const initialZoom = defaultCamera?.zoom ?? DEFAULT_ZOOM;

  const nationalParks = places.filter((p) => p.category === 'national_park');
  const countryFeatures = regionsToFeatureCollection(regions.filter((r) => r.level === 'country'));
  const stateFeatures = regionsToFeatureCollection(regions.filter((r) => r.level === 'admin_area_1'));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <MapView style={styles.map} styleURL={MAPBOX_STYLE_URL} scaleBarEnabled={false} onMapIdle={handleMapIdle}>
          <Camera defaultSettings={{ centerCoordinate, zoomLevel: initialZoom }} />

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

          <View style={styles.bottomBar}>
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
            {isOwnProfile && (
              <View style={styles.ownerActionsRow}>
                <Pressable onPress={handleSaveDefault} disabled={isSavingDefault}>
                  <ThemedText type="small" themeColor="sage">
                    {isSavingDefault ? 'Saving…' : 'Set as default'}
                  </ThemedText>
                </Pressable>
                <Pressable onPress={handleLockView} disabled={isLockingView}>
                  <ThemedText type="small" themeColor="sage">
                    {isLockingView ? 'Locking…' : 'Lock this view'}
                  </ThemedText>
                </Pressable>
              </View>
            )}
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
  // Extra lift above the bare safe-area padding — the SDK's own Mapbox
  // logo/attribution mark renders in the bottom-left corner by default with
  // no room carved out for it, so "Set as default" was crowding/overlapping it.
  bottomBar: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  ownerActionsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
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
    backgroundColor: NATIONAL_PARK_COLOR,
    borderWidth: 2,
    borderColor: BrandColors.cream,
  },
});
