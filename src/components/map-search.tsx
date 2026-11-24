import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  LOCAL_ZOOM,
  MapSearchOverlay,
  pinLook,
  useMapSearch,
} from '@/components/map-search-panel';
import { BrandColors, BrandFonts } from '@/constants/theme';
import type { MapPlace } from '@/lib/map-search';

type MapSearchProps = {
  visible: boolean;
  onClose: () => void;
  viewerId: string;
};

// Same style as the phone's map (Mapbox's dark style), as the other web maps
// use; see location-search-modal.tsx.
const STYLE_URL = 'mapbox://styles/mapbox/dark-v10';

mapboxgl.accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

// Map search on the web: the phone's map search (map-search.native.tsx)
// drawn with mapbox-gl, since @rnmapbox/maps has no web build. The
// searching, the filters and the panel over the map are the same component
// on both (map-search-panel.tsx); only the map and its pins are drawn here,
// the pins as page elements styled to match the phone's.
export function MapSearch({ visible, onClose, viewerId }: MapSearchProps) {
  const search = useMapSearch({ visible, viewerId, onClose });
  const containerRef = useRef<View>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: mapboxgl.Marker; element: HTMLDivElement; place: MapPlace }>>(new Map());
  // The latest handlers, for listeners attached once when the map is made.
  const handlersRef = useRef(search);
  useEffect(() => {
    handlersRef.current = search;
  });

  // The map, made once the opening view is settled and torn down on close.
  useEffect(() => {
    if (!visible || !search.ready) return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node) return;
    const center = search.center;
    const map = new mapboxgl.Map({
      container: node,
      style: STYLE_URL,
      center: center ?? DEFAULT_CENTER,
      zoom: center ? LOCAL_ZOOM : DEFAULT_ZOOM,
    });
    mapRef.current = map;

    const report = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      handlersRef.current.setBounds({
        minLat: bounds.getSouth(),
        minLng: bounds.getWest(),
        maxLat: bounds.getNorth(),
        maxLng: bounds.getEast(),
      });
    };
    map.on('load', report);
    map.on('moveend', report);
    map.on('click', () => handlersRef.current.clearSelection());
    map.on('error', (e) => console.warn('Mapbox error:', e.error?.message ?? e));

    // mapbox-gl measures its container once; inside a modal's flex layout
    // that can still be settling, so it is told when the size really changes
    // (see location-search-modal.tsx for what happens otherwise).
    let lastSize = '';
    const resizeObserver = new ResizeObserver(([entry]) => {
      const size = `${entry.contentRect.width}x${entry.contentRect.height}`;
      if (size === lastSize) return;
      lastSize = size;
      map.resize();
    });
    resizeObserver.observe(node);

    const markers = markersRef.current;
    return () => {
      resizeObserver.disconnect();
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
    // Made once per opening, from the centre known when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, search.ready]);

  // The pins: added and removed to match the search, the existing ones kept
  // so a pin under the cursor does not flicker on every search.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const wanted = new Set(search.places.map((place) => place.id));
    for (const [id, entry] of markers) {
      if (!wanted.has(id)) {
        entry.marker.remove();
        markers.delete(id);
      }
    }
    for (const place of search.places) {
      if (markers.has(place.id)) continue;
      const element = pinElement(place);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        void handlersRef.current.select(place);
      });
      const marker = new mapboxgl.Marker({ element }).setLngLat([place.lng, place.lat]).addTo(map);
      markers.set(place.id, { marker, element, place });
    }
  }, [search.places]);

  // The picked pin drawn larger, as on the phone.
  useEffect(() => {
    for (const [id, { element }] of markersRef.current) {
      showSelected(element, search.selected?.id === id);
    }
  }, [search.selected, search.places]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View ref={containerRef} style={styles.map} />
        <MapSearchOverlay search={search} onClose={onClose} />
      </View>
    </Modal>
  );
}

// A pin drawn larger and on top while it is the one picked. The scale goes
// on the inner element: mapbox-gl positions the marker by writing
// `transform` on the outer one, and a scale there would undo it.
function showSelected(element: HTMLDivElement, selected: boolean) {
  const pin = element.firstElementChild as HTMLElement | null;
  if (pin) pin.style.transform = selected ? 'scale(1.25)' : '';
  element.style.zIndex = selected ? '2' : '';
}

// The phone's RatingPin (map-search.native.tsx) as a page element: an outer
// element for mapbox-gl to position, and the pin inside it.
function pinElement(place: MapPlace): HTMLDivElement {
  const look = pinLook(place);
  const outer = document.createElement('div');
  outer.style.cursor = 'pointer';
  outer.setAttribute('role', 'button');
  outer.setAttribute(
    'aria-label',
    `${place.name}${place.avgRating != null ? `, ${place.avgRating.toFixed(1)} average` : ''}, ${place.reviewCount} review${place.reviewCount === 1 ? '' : 's'}`,
  );
  const pin = document.createElement('div');
  pin.style.boxSizing = 'border-box';
  pin.style.display = 'flex';
  pin.style.alignItems = 'center';
  pin.style.justifyContent = 'center';
  pin.style.background = look.fill;
  pin.style.borderStyle = 'solid';
  pin.style.borderColor = look.ring;
  pin.style.transition = 'transform 120ms ease-out';
  if (look.label) {
    pin.style.minWidth = '34px';
    pin.style.height = '26px';
    pin.style.padding = '0 5px';
    pin.style.borderRadius = '13px';
    pin.style.borderWidth = '2px';
    pin.style.fontFamily = BrandFonts.condensedHeavy;
    pin.style.fontSize = '13px';
    pin.style.color = '#fff';
    pin.style.textShadow = '0 0 2px rgba(0, 0, 0, 0.6)';
    pin.textContent = look.label;
  } else {
    pin.style.width = '16px';
    pin.style.height = '16px';
    pin.style.borderRadius = '8px';
    pin.style.borderWidth = '3px';
  }
  outer.appendChild(pin);
  return outer;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  // flex, not absoluteFill: mapbox-gl overrides `position` on its container
  // (see location-search-modal.tsx's own map style).
  map: {
    flex: 1,
  },
});
