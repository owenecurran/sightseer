import { Camera, FillLayer, LineLayer, MapView, PointAnnotation, ShapeSource } from '@rnmapbox/maps';
import type { FeatureCollection, Polygon } from 'geojson';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProfileMapModal } from '@/components/profile-map-modal';
import { ThemedText } from '@/components/themed-text';
import { MAPBOX_STYLE_URL } from '@/constants/mapbox.native';
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

// Small embedded preview — renders whichever layers `defaultLayers` (from
// `users.map_default_layers`, set via ProfileMapModal's "Set as default")
// says to show, same layer set/rendering as the full-screen modal, just at
// preview size. Tap still expands into `ProfileMapModal` for ad hoc toggling.
export function ProfileMap({ userId, defaultLayers, isOwnProfile }: ProfileMapProps) {
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof getVisitedPlacesWithCategory>> | null>(null);
  const [regions, setRegions] = useState<VisitedRegion[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const layers = parseDefaultLayers(defaultLayers);

  useEffect(() => {
    getVisitedPlacesWithCategory(userId)
      .then(setPlaces)
      .catch(() => setPlaces([]));
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

  if (!places || places.length === 0) return null;

  const nationalParks = places.filter((p) => p.category === 'national_park');
  const countryFeatures = regionsToFeatureCollection(regions.filter((r) => r.level === 'country'));
  const stateFeatures = regionsToFeatureCollection(regions.filter((r) => r.level === 'admin_area_1'));

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        📍 {places.length} place{places.length === 1 ? '' : 's'} visited — tap to explore
      </ThemedText>
      <Pressable onPress={() => setIsExpanded(true)}>
        <MapView style={styles.map} styleURL={MAPBOX_STYLE_URL} scaleBarEnabled={false} scrollEnabled={false} zoomEnabled={false}>
          <Camera defaultSettings={{ centerCoordinate: centroid(places), zoomLevel: DEFAULT_ZOOM }} />
          {layers.has('countries') && (
            <ShapeSource id="countries-source" shape={countryFeatures}>
              <FillLayer id="countries-fill" style={{ fillColor: COUNTRY_FILL, fillOpacity: COUNTRY_FILL_OPACITY }} />
              <LineLayer id="countries-line" style={{ lineColor: COUNTRY_LINE, lineWidth: 2 }} />
            </ShapeSource>
          )}
          {layers.has('states') && (
            <ShapeSource id="states-source" shape={stateFeatures}>
              <FillLayer id="states-fill" style={{ fillColor: STATE_FILL, fillOpacity: STATE_FILL_OPACITY }} />
              <LineLayer id="states-line" style={{ lineColor: STATE_LINE, lineWidth: 2 }} />
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
