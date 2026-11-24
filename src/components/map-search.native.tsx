import { Camera, MapView, MarkerView, type MapState } from '@rnmapbox/maps';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  LOCAL_ZOOM,
  MapSearchOverlay,
  pinLook,
  useMapSearch,
} from '@/components/map-search-panel';
import { MAPBOX_STYLE_URL } from '@/constants/mapbox.native';
import { BrandColors, BrandFonts } from '@/constants/theme';
import type { MapPlace } from '@/lib/map-search';

type MapSearchProps = {
  visible: boolean;
  onClose: () => void;
  viewerId: string;
};

// Map search on the phone: every reviewed place in view as a pin, the pin
// showing its average in the rating's own colour, with filters for rating,
// how many reviews and tags. Only the map and its pins are drawn here; the
// searching, the filters and the panel are map-search-panel.tsx, shared
// with the web's copy (map-search.tsx).
export function MapSearch({ visible, onClose, viewerId }: MapSearchProps) {
  const search = useMapSearch({ visible, viewerId, onClose });

  function handleMapIdle(state: MapState) {
    const { ne, sw } = state.properties.bounds;
    search.setBounds({ minLat: sw[1], minLng: sw[0], maxLat: ne[1], maxLng: ne[0] });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {search.ready && (
          <MapView
            style={styles.map}
            styleURL={MAPBOX_STYLE_URL}
            scaleBarEnabled={false}
            onMapIdle={handleMapIdle}
            onPress={search.clearSelection}>
            <Camera
              defaultSettings={{
                centerCoordinate: search.center ?? DEFAULT_CENTER,
                zoomLevel: search.center ? LOCAL_ZOOM : DEFAULT_ZOOM,
              }}
            />
            {search.places.map((place) => (
              // MarkerView rather than PointAnnotation: PointAnnotation draws
              // its children to a bitmap and loses their touches (see
              // location-search-modal.native.tsx).
              <MarkerView key={place.id} coordinate={[place.lng, place.lat]}>
                <Pressable onPress={() => void search.select(place)} hitSlop={6}>
                  <RatingPin place={place} selected={search.selected?.id === place.id} />
                </Pressable>
              </MarkerView>
            ))}
          </MapView>
        )}
        <MapSearchOverlay search={search} onClose={onClose} />
      </View>
    </Modal>
  );
}

function RatingPin({ place, selected }: { place: MapPlace; selected: boolean }) {
  const look = pinLook(place);
  return (
    <View
      style={[
        look.label ? styles.pin : styles.pinUnrated,
        { backgroundColor: look.fill, borderColor: look.ring },
        selected && styles.pinSelected,
      ]}>
      {look.label && <Text style={styles.pinText}>{look.label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  pin: {
    minWidth: 34,
    height: 26,
    paddingHorizontal: 5,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinUnrated: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
  },
  pinSelected: {
    transform: [{ scale: 1.25 }],
    borderWidth: 3,
  },
  pinText: {
    fontFamily: BrandFonts.condensedHeavy,
    fontSize: 13,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowRadius: 2,
    includeFontPadding: false,
  },
});
