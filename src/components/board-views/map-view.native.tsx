import { Camera, MapView, PointAnnotation } from '@rnmapbox/maps';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MAPBOX_STYLE_URL } from '@/constants/mapbox.native';
import { BrandColors, Spacing } from '@/constants/theme';
import type { BoardVisitItem } from '@/lib/boards';

type MapViewProps = {
  items: BoardVisitItem[];
};

// Matches location-search-modal's SELECTED_ZOOM — the "zoomed into one
// specific place" level, used when there's only a single pin to show
// (there's nothing to fit bounds against with just one point).
const SINGLE_PIN_ZOOM = 13;
const BOUNDS_PADDING = 48;

// One pin per unique place in the board, camera fit to bounds of all pins —
// unlike ProfileMap's fixed-zoom centroid, a board can span anywhere from
// one city block to several continents.
export function BoardMapView({ items }: MapViewProps) {
  const places = new Map<string, { lat: number; lng: number; name: string; visitId: string }>();
  for (const item of items) {
    if (item.placeLat == null || item.placeLng == null) continue;
    const key = `${item.placeLat},${item.placeLng}`;
    if (!places.has(key)) {
      places.set(key, { lat: item.placeLat, lng: item.placeLng, name: item.placeName, visitId: item.visitId });
    }
  }
  const pins = [...places.values()];

  if (pins.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          None of these reviews have a mappable location yet.
        </ThemedText>
      </View>
    );
  }

  const lats = pins.map((p) => p.lat);
  const lngs = pins.map((p) => p.lng);
  const bounds =
    pins.length > 1
      ? { ne: [Math.max(...lngs), Math.max(...lats)] as [number, number], sw: [Math.min(...lngs), Math.min(...lats)] as [number, number] }
      : undefined;
  const centerCoordinate: [number, number] = [pins[0].lng, pins[0].lat];

  return (
    <MapView style={styles.map} styleURL={MAPBOX_STYLE_URL} scaleBarEnabled={false}>
      <Camera
        defaultSettings={
          bounds
            ? {
                bounds: {
                  ...bounds,
                  paddingLeft: BOUNDS_PADDING,
                  paddingRight: BOUNDS_PADDING,
                  paddingTop: BOUNDS_PADDING,
                  paddingBottom: BOUNDS_PADDING,
                },
              }
            : { centerCoordinate, zoomLevel: SINGLE_PIN_ZOOM }
        }
      />
      {pins.map((pin) => (
        <PointAnnotation
          key={`${pin.lat},${pin.lng}`}
          id={`${pin.lat},${pin.lng}`}
          coordinate={[pin.lng, pin.lat]}
          onSelected={() => router.push({ pathname: '/visit/[id]', params: { id: pin.visitId } })}>
          <View style={styles.pin} />
        </PointAnnotation>
      ))}
    </MapView>
  );
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
  pin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: BrandColors.sage,
    borderWidth: 2,
    borderColor: BrandColors.cream,
  },
});
