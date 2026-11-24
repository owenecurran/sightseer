import { Camera, CircleLayer, FillLayer, LineLayer, MapView, PointAnnotation, ShapeSource } from '@rnmapbox/maps';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { useEffect, useId, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProfileMapModal } from '@/components/profile-map-modal';
import { ThemedText } from '@/components/themed-text';
import { StickerArrow } from '@/components/ui/sticker-arrow';
import { MAPBOX_STYLE_URL } from '@/constants/mapbox.native';
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
  // After the owner saves which layers it shows, so this preview, read from
  // the same profile row, shows them too.
  onLayersSaved?: () => void;
};

const MAP_HEIGHT = 220;
const DEFAULT_ZOOM = 3;

function centroid(places: { lat: number; lng: number }[]): [number, number] {
  const lat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
  const lng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
  return [lng, lat];
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

// Small embedded preview — renders whichever layers `defaultLayers` (from
// `users.map_default_layers`, set via ProfileMapModal's "Set as default")
// says to show, same layer set/rendering as the full-screen modal, just at
// preview size. Tap still expands into `ProfileMapModal` for ad hoc toggling.
export function ProfileMap({
  userId,
  defaultLayers,
  defaultCamera,
  isOwnProfile,
  onCameraLocked,
  onLayersSaved,
}: ProfileMapProps) {
  // Unique per mounted component, which the layer ids below need to be.
  //
  // Mapbox keeps ONE layer registry per style and these ids are added to it.
  // A fixed id collides the moment two of these exist at once — and one
  // always does the moment `defaultCamera` resolves, because the MapView
  // below is deliberately keyed on it and remounts. The old mount's layers
  // are still registered when the new one adds its own, and rnmapbox logs
  //
  //   RNMBXLayer | Layer preview-countries-fill seems to refer to an
  //   existing layer but existing flag is not specified
  //
  // Prefixing by component was not enough — that only separated this from
  // the modal, not this from ITSELF a moment earlier. useId is per instance,
  // so a remount gets a fresh set.
  const layerId = useId();
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof getVisitedPlacesWithCategory>> | null>(null);
  const [regions, setRegions] = useState<VisitedRegion[]>([]);
  // The cities, and how many countries and states, for the Cities layer and
  // the caption. 'failed' leaves the caption on the count of places.
  const [hierarchy, setHierarchy] = useState<VisitedHierarchy | 'failed' | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
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
    if (!layers.has('countries') && !layers.has('states')) return;
    getVisitedRegions(userId)
      .then(setRegions)
      .catch(() => setRegions([]));
    // layers is recomputed fresh every render from the defaultLayers prop —
    // depending on defaultLayers itself (stable-ish, from the profile row)
    // rather than the derived Set avoids re-fetching on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, defaultLayers]);

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
  const cityFeatures = citiesToFeatureCollection(hierarchy === 'failed' ? [] : hierarchy.cities);

  const nationalParks = places.filter((p) => p.category === 'national_park');
  const countryFeatures = regionsToFeatureCollection(regions.filter((r) => r.level === 'country'));
  const stateFeatures = regionsToFeatureCollection(regions.filter((r) => r.level === 'admin_area_1'));

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
        {/* Keyed on whether a locked camera is resolved yet — Camera's
            defaultSettings only ever applies once per mount, so if this
            mounted before defaultCamera arrived it would otherwise be stuck
            on the auto-centroid forever; a key change forces a fresh mount
            once the real value is known. */}
        <MapView
          key={defaultCamera ? 'locked' : 'auto'}
          style={styles.map}
          styleURL={MAPBOX_STYLE_URL}
          scaleBarEnabled={false}
          scrollEnabled={false}
          zoomEnabled={false}>
          <Camera
            defaultSettings={{
              centerCoordinate: defaultCamera ? [defaultCamera.lng, defaultCamera.lat] : centroid(places),
              zoomLevel: defaultCamera?.zoom ?? DEFAULT_ZOOM,
            }}
          />
          {layers.has('countries') && (
            <ShapeSource id={`${layerId}-countries-source`} shape={countryFeatures}>
              <FillLayer id={`${layerId}-countries-fill`} style={{ fillColor: COUNTRY_FILL, fillOpacity: COUNTRY_FILL_OPACITY }} />
              <LineLayer id={`${layerId}-countries-line`} style={{ lineColor: COUNTRY_LINE, lineWidth: 2 }} />
            </ShapeSource>
          )}
          {layers.has('states') && (
            <ShapeSource id={`${layerId}-states-source`} shape={stateFeatures}>
              <FillLayer id={`${layerId}-states-fill`} style={{ fillColor: STATE_FILL, fillOpacity: STATE_FILL_OPACITY }} />
              <LineLayer id={`${layerId}-states-line`} style={{ lineColor: STATE_LINE, lineWidth: 2 }} />
            </ShapeSource>
          )}
          {layers.has('cities') && (
            <ShapeSource id={`${layerId}-cities-source`} shape={cityFeatures}>
              <CircleLayer
                id={`${layerId}-cities-dot`}
                style={{ circleRadius: 5, circleColor: CITY_COLOR, circleStrokeColor: CITY_RING, circleStrokeWidth: 2 }}
              />
            </ShapeSource>
          )}
          {layers.has('pins') &&
            places.map((p) => (
              <PointAnnotation key={p.id} id={p.id} coordinate={[p.lng, p.lat]}>
                <View style={styles.pin} />
              </PointAnnotation>
            ))}
          {layers.has('national_parks') &&
            nationalParks.map((p) => (
              <PointAnnotation key={`np-${p.id}`} id={`np-${p.id}`} coordinate={[p.lng, p.lat]}>
                <View style={styles.nationalParkPin} />
              </PointAnnotation>
            ))}
        </MapView>
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
