import { AppleMaps, GoogleMaps } from 'expo-maps';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getVisitedPlaces, getVisitedRegions, type VisitedPlace, type VisitedRegion } from '@/lib/profile-map';

type ProfileMapProps = {
  userId: string;
};

const MAP_HEIGHT = 220;
const DEFAULT_ZOOM = 3;
const REGION_FILL = '#1E88E533';
const REGION_LINE = '#1E88E5';

function centroid(places: VisitedPlace[]): { latitude: number; longitude: number } {
  const lat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
  const lng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
  return { latitude: lat, longitude: lng };
}

export function ProfileMap({ userId }: ProfileMapProps) {
  const [places, setPlaces] = useState<VisitedPlace[] | null>(null);
  const [regions, setRegions] = useState<VisitedRegion[]>([]);

  useEffect(() => {
    getVisitedPlaces(userId)
      .then(setPlaces)
      .catch(() => setPlaces([]));
    // Regions load separately and slower (may need a first-time boundary
    // fetch) — pins shouldn't wait on them.
    getVisitedRegions(userId)
      .then(setRegions)
      .catch(() => setRegions([]));
  }, [userId]);

  if (!places || places.length === 0) return null;

  const cameraPosition = { coordinates: centroid(places), zoom: DEFAULT_ZOOM };

  const polygons = regions.flatMap((region) =>
    region.rings.map((ring, index) => ({
      id: `${region.id}-${index}`,
      coordinates: ring,
      color: REGION_FILL,
      lineColor: REGION_LINE,
      lineWidth: 2,
    }))
  );

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        📍 {places.length} place{places.length === 1 ? '' : 's'} visited
      </ThemedText>
      {Platform.OS === 'ios' ? (
        <AppleMaps.View
          style={styles.map}
          cameraPosition={cameraPosition}
          polygons={polygons}
          annotations={places.map((p) => ({
            coordinates: { latitude: p.lat, longitude: p.lng },
            title: p.name,
            id: p.id,
          }))}
        />
      ) : (
        <GoogleMaps.View
          style={styles.map}
          cameraPosition={cameraPosition}
          polygons={polygons}
          markers={places.map((p) => ({
            coordinates: { latitude: p.lat, longitude: p.lng },
            title: p.name,
            id: p.id,
          }))}
        />
      )}
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
});
