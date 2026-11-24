import {
  Camera,
  CircleLayer,
  FillLayer,
  LineLayer,
  MapView,
  PointAnnotation,
  ShapeSource,
  SymbolLayer,
  type MapState,
} from '@rnmapbox/maps';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { useEffect, useId, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Mapbox layer ids here are prefixed `modal-`, and the preview's are
// prefixed `preview-` (profile-map.native.tsx). That is load-bearing.
//
// Both components add country and state layers to the same Mapbox style, and
// they used to use identical ids. Mapbox keeps one layer registry per style,
// so whichever mounted second found the first's layers already there and
// logged a console error:
//
//   RNMBXLayer | Layer countries-line seems to refer to an existing layer
//   but existing flag is not specified, this is deprecated
//
// A collision, not a coincidence. Namespacing makes the two sets distinct.
import { ThemedText } from '@/components/themed-text';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { PaperPanel } from '@/components/ui/paper-panel';
import { CircledTabs } from '@/components/ui/circled-tabs';
import { MAPBOX_STYLE_URL } from '@/constants/mapbox.native';
import { BrandColors, Spacing } from '@/constants/theme';
import { userErrorMessage } from '@/lib/user-error';
import {
  CITY_COLOR,
  CITY_RING,
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
  getVisitedHierarchy,
  getVisitedPlacesWithCategory,
  getVisitedRegions,
  saveDefaultMapCamera,
  saveDefaultMapLayers,
  type VisitedCity,
  type VisitedRegion,
} from '@/lib/profile-map';

type ProfileMapModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string;
  defaultLayers?: string[];
  defaultCamera?: { lat: number; lng: number; zoom: number } | null;
  isOwnProfile?: boolean;
  // Called after a successful "Lock this view" save — the caller's own
  // profile/user context object is never otherwise updated with the newly
  // saved camera, so without this the small preview thumbnail (which reads
  // defaultCamera from that same context) keeps showing the stale value
  // until the next full reload.
  onCameraLocked?: () => void;
  // The same, after "Save layers": the preview reads its layers from that
  // profile row too, and kept showing the old ones until a reload.
  onLayersSaved?: () => void;
};

const DEFAULT_ZOOM = 3;

function citiesToFeatureCollection(cities: VisitedCity[]): FeatureCollection<Point> {
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
  onCameraLocked,
  onLayersSaved,
}: ProfileMapModalProps) {
  // Per instance, for the reason set out in profile-map.native.tsx: a
  // fixed id collides with any other MapView alive at the same moment,
  // including an earlier mount of this same component.
  const layerId = useId();
  const [activeLayers, setActiveLayers] = useState<Set<LayerKey>>(() => parseDefaultLayers(defaultLayers));
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof getVisitedPlacesWithCategory>>>([]);
  const [regions, setRegions] = useState<VisitedRegion[]>([]);
  const [cities, setCities] = useState<VisitedCity[]>([]);
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const [isLockingView, setIsLockingView] = useState(false);
  // What the last save said. Both saves change what every visitor to this
  // profile sees, and they gave no word either way: a save that worked
  // looked the same as one that failed, and a failure was dropped.
  const [saveNote, setSaveNote] = useState<{ text: string; failed: boolean } | null>(null);
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
    getVisitedHierarchy(userId)
      .then((hierarchy) => setCities(hierarchy.cities))
      .catch(() => setCities([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userId]);

  async function handleSaveDefault() {
    setIsSavingDefault(true);
    setSaveNote(null);
    try {
      await saveDefaultMapLayers(userId, Array.from(activeLayers));
      onLayersSaved?.();
      setSaveNote({ text: 'Saved. Visitors now see these layers first.', failed: false });
    } catch (err) {
      setSaveNote({ text: userErrorMessage(err, 'Could not save these layers. Try again.'), failed: true });
    } finally {
      setIsSavingDefault(false);
    }
  }

  async function handleLockView() {
    const camera = latestCameraRef.current;
    if (!camera) return;
    setIsLockingView(true);
    setSaveNote(null);
    try {
      await saveDefaultMapCamera(userId, { lat: camera.lat, lng: camera.lng }, camera.zoom);
      onCameraLocked?.();
      setSaveNote({ text: 'Saved. Your map now opens here for visitors.', failed: false });
    } catch (err) {
      setSaveNote({ text: userErrorMessage(err, 'Could not save this view. Try again.'), failed: true });
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
  const cityFeatures = citiesToFeatureCollection(cities);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <MapView style={styles.map} styleURL={MAPBOX_STYLE_URL} scaleBarEnabled={false} onMapIdle={handleMapIdle}>
          <Camera defaultSettings={{ centerCoordinate, zoomLevel: initialZoom }} />

          {activeLayers.has('countries') && (
            <ShapeSource id={`${layerId}-countries-source`} shape={countryFeatures}>
              <FillLayer id={`${layerId}-countries-fill`} style={{ fillColor: COUNTRY_FILL, fillOpacity: COUNTRY_FILL_OPACITY }} />
              <LineLayer id={`${layerId}-countries-line`} style={{ lineColor: COUNTRY_LINE, lineWidth: 2 }} />
            </ShapeSource>
          )}
          {activeLayers.has('states') && (
            <ShapeSource id={`${layerId}-states-source`} shape={stateFeatures}>
              <FillLayer id={`${layerId}-states-fill`} style={{ fillColor: STATE_FILL, fillOpacity: STATE_FILL_OPACITY }} />
              <LineLayer id={`${layerId}-states-line`} style={{ lineColor: STATE_LINE, lineWidth: 2 }} />
            </ShapeSource>
          )}
          {/* A dot for each city, named beside it. The names are a symbol
              layer, which hides the ones that would overlap and brings them
              back as the map is zoomed in. */}
          {activeLayers.has('cities') && (
            <ShapeSource id={`${layerId}-cities-source`} shape={cityFeatures}>
              <CircleLayer
                id={`${layerId}-cities-dot`}
                style={{ circleRadius: 6, circleColor: CITY_COLOR, circleStrokeColor: CITY_RING, circleStrokeWidth: 2 }}
              />
              <SymbolLayer
                id={`${layerId}-cities-name`}
                style={{
                  textField: ['get', 'name'],
                  textSize: 12,
                  textColor: CITY_RING,
                  textHaloColor: 'rgba(5, 15, 10, 0.85)',
                  textHaloWidth: 1.5,
                  textAnchor: 'top',
                  textOffset: [0, 0.9],
                }}
              />
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
          {/* The app's back control, as every other screen leaves by: the
              sticker arrow is its own disc of colour, so it reads over any
              map. This was a cream pill. */}
          <View style={styles.closeButton}>
            <BackLink label="Close" onPress={onClose} seed="profile-map" />
          </View>

          {/* The controls sit ON a paper panel now, not bare on the map.
              Two reasons, and the second is not cosmetic: every other
              surface in this app that holds controls is a PaperPanel, and a
              chip row floating directly over map tiles had no contrast
              guarantee at all — it was legible over dark ocean and nearly
              invisible over pale desert, depending entirely on where the
              person happened to have panned. */}
          <PaperPanel seed="map-controls" style={styles.bottomBar}>
            {/* Typed and ringed in pen, each layer that is on, as Search's
                filters are. These were pill chips. */}
            <CircledTabs
              items={LAYER_OPTIONS}
              active={Array.from(activeLayers)}
              onChange={toggleLayer}
            />
            {/* Buttons rather than bare sage text. These two WRITE something
                — they change what every visitor to this profile sees — and
                they read as less consequential than the layer chips above
                them, which only change the current view.
                
                Relabelled as well: "Set as default" never said default WHAT,
                and "Lock this view" sounded like it stopped the map moving.
                One saves the layer selection, the other saves the camera, so
                they now say so — and they fit on one line, which the old
                labels did not once they became buttons. */}
            {isOwnProfile && (
              <View style={styles.ownerActionsRow}>
                <Button
                  label={isSavingDefault ? 'Saving…' : 'Save layers'}
                  variant="secondary"
                  onPress={handleSaveDefault}
                  loading={isSavingDefault}
                  style={styles.ownerAction}
                />
                <Button
                  label={isLockingView ? 'Saving…' : 'Save view'}
                  variant="secondary"
                  onPress={handleLockView}
                  loading={isLockingView}
                  style={styles.ownerAction}
                />
              </View>
            )}
            {saveNote && (
              <ThemedText type="small" themeColor={saveNote.failed ? 'danger' : 'sage'}>
                {saveNote.text}
              </ThemedText>
            )}
          </PaperPanel>
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
  // A dark wash behind the word only, so "Close" stays legible over pale
  // ground; the arrow brings its own.
  closeButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.three,
    borderRadius: Spacing.five,
    backgroundColor: 'rgba(5, 15, 10, 0.55)',
  },
  // Extra lift above the bare safe-area padding — the SDK's own Mapbox
  // logo/attribution mark renders in the bottom-left corner by default with
  // no room carved out for it, so "Set as default" was crowding/overlapping it.
  bottomBar: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  ownerAction: {
    flex: 1,
  },
  ownerActionsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
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
