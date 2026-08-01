import { Camera, MapView, PointAnnotation } from '@rnmapbox/maps';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProfileMapModal } from '@/components/profile-map-modal';
import { ThemedText } from '@/components/themed-text';
import { MAPBOX_STYLE_URL } from '@/constants/mapbox.native';
import { BrandColors, Spacing } from '@/constants/theme';
import { getVisitedPlaces, type VisitedPlace } from '@/lib/profile-map';

type ProfileMapProps = {
  userId: string;
};

const MAP_HEIGHT = 220;
const DEFAULT_ZOOM = 3;

function centroid(places: VisitedPlace[]): [number, number] {
  const lat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
  const lng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
  return [lng, lat];
}

// Small embedded preview — pins only, matching the look this always had —
// tap to expand into `ProfileMapModal`'s full-screen, multi-layer view
// (countries/states/national parks are toggle-only there, not shown here,
// so the preview stays visually identical to before this Mapbox migration).
export function ProfileMap({ userId }: ProfileMapProps) {
  const [places, setPlaces] = useState<VisitedPlace[] | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    getVisitedPlaces(userId)
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, [userId]);

  if (!places || places.length === 0) return null;

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        📍 {places.length} place{places.length === 1 ? '' : 's'} visited — tap to explore
      </ThemedText>
      <Pressable onPress={() => setIsExpanded(true)}>
        <MapView style={styles.map} styleURL={MAPBOX_STYLE_URL} scaleBarEnabled={false} scrollEnabled={false} zoomEnabled={false}>
          <Camera defaultSettings={{ centerCoordinate: centroid(places), zoomLevel: DEFAULT_ZOOM }} />
          {places.map((p) => (
            <PointAnnotation key={p.id} id={p.id} coordinate={[p.lng, p.lat]}>
              <View style={styles.pin} />
            </PointAnnotation>
          ))}
        </MapView>
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
  },
  pin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: BrandColors.sage,
    borderWidth: 2,
    borderColor: BrandColors.cream,
  },
});
