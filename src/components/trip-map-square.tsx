import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { BoardMapView } from '@/components/board-views/map-view';
import { ThemedText } from '@/components/themed-text';
import { LoadableImage } from '@/components/ui/loadable-image';
import { Spacing } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BoardVisitItem } from '@/lib/boards';
import type { FeedVisit } from '@/lib/feed';
import { readableColorForRating } from '@/lib/rating-gradient';

// Matches location-search-modal's STYLE_URL, in the form the Static Images
// API wants (`mapbox/dark-v10` rather than the `mapbox://styles/` URI).
const STATIC_STYLE = 'mapbox/dark-v10';
const SQUARE_SIZE = 72;
// Zoomed out further than a tight fit around the pins would give: a trip's
// reviews usually cluster in one neighbourhood, and framing them exactly
// shows a few blocks rather than the destination the trip is actually
// labeled with. Capping the zoom keeps the city itself recognisable in a
// 72px square.
const MAX_ZOOM = 11;
// Static API caps at 2x; anything beyond just wastes bytes.
const RETINA = '@2x';
// Enough of a margin around the trip's own bounds that pins don't sit on
// the thumbnail's edge.
const BOUNDS_PADDING_RATIO = 1.6;
// Ring drawn around the thumbnail, tinted by the trip's average score — the
// same gradient the rating stamps use, so a glance at the map square reads
// as "how good was this trip" without a number on it.
const BORDER_WIDTH = 4;
const MIN_SPAN_DEGREES = 0.02;
// How many pins to actually draw. The Static API takes them as path
// segments in the URL, so an unbounded list would build a URL long enough
// for the CDN to reject outright — and past a handful they're unreadable at
// 72px anyway.
const MAX_PINS = 5;

type TripMapSquareProps = {
  visits: FeedVisit[];
  // The trip's destination. Centring here rather than on the midpoint of
  // the pins is what stops a single layover dragging the frame off into
  // empty country — see the migration that added these coordinates.
  center?: { lat: number; lng: number } | null;
};

// Rating rides along with the coordinate so each pin can be tinted by the
// review it stands for, rather than the whole trip sharing one colour.
type Coord = { lat: number; lng: number; rating: number | null };

function coordsOf(visits: FeedVisit[]): Coord[] {
  return visits
    .filter((v): v is FeedVisit & { placeLat: number; placeLng: number } =>
      v.placeLat != null && v.placeLng != null
    )
    .map((v) => ({ lat: v.placeLat, lng: v.placeLng, rating: v.rating }));
}

// Which pin decides how far out to zoom. Framing to the OUTERMOST pin let a
// single distant review wreck the thumbnail: a Seattle trip carrying one
// Chicago stop framed at zoom 2.71 — most of North America, with neither
// city legible at 72px. Centring on the destination was already fixed for
// exactly this reason, but the centre and the zoom were computed
// separately, so the outlier still dragged the zoom even once it had
// stopped dragging the frame.
//
// A high percentile instead of the maximum keeps the thumbnail framed on
// where the trip actually happened and simply lets a stray pin fall outside
// it, which is the right trade for a 72px square: the expanded map still
// fits every pin properly.
const FRAME_PERCENTILE = 0.8;

function percentileOf(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  // floor, not ceil: with a handful of pins and one outlier, rounding up
  // lands back on the outlier and undoes the point of this.
  return sorted[Math.floor(fraction * (sorted.length - 1))];
}

// Rough web-mercator-ish fit: enough to frame a trip's pins in a 72px
// square, not a precise viewport calculation (the real interactive map
// below does its own proper fitBounds once expanded).
function frameFor(
  coords: Coord[],
  destination?: { lat: number; lng: number } | null
): { center: { lat: number; lng: number }; zoom: number } {
  const lats = coords.map((c) => c.lat);
  const lngs = coords.map((c) => c.lng);
  // The destination wins when known; the midpoint of the pins is the
  // fallback for a trip whose area has no coordinates cached.
  const center = destination ?? {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };

  // Spread measured from the centre outwards, so it means the same thing
  // whether the centre came from the destination or from the pins.
  const reach = Math.max(
    percentileOf(coords.map((c) => Math.abs(c.lat - center.lat)), FRAME_PERCENTILE),
    percentileOf(coords.map((c) => Math.abs(c.lng - center.lng)), FRAME_PERCENTILE)
  );
  const span = Math.max(reach * 2 * BOUNDS_PADDING_RATIO, MIN_SPAN_DEGREES);
  const zoom = Math.min(MAX_ZOOM, Math.max(1, Math.log2(360 / span)));
  return { center, zoom };
}

// FeedVisit -> the shape BoardMapView already knows how to plot. Only the
// fields that view actually reads are meaningful; the rest exist to satisfy
// the type, which is why this is a local adapter rather than something
// exported for reuse.
function toBoardItems(visits: FeedVisit[]): BoardVisitItem[] {
  return visits.map((v) => ({
    kind: 'visit',
    id: v.id,
    visitId: v.id,
    addedAt: v.created_at,
    rating: v.rating,
    note: v.note,
    visitedOn: v.visited_on,
    authorId: v.user_id,
    authorName: v.authorName,
    placeId: v.placeId,
    placeName: v.placeName,
    stateCountry: v.stateCountry,
    placeLat: v.placeLat,
    placeLng: v.placeLng,
    photoIds: v.photoIds,
    photoAspectRatios: v.photoAspectRatios,
  }));
}

// A small square preview of where a trip happened, which expands into the
// real interactive map of every place on it.
//
// The thumbnail is a Static Images API *image*, not a live map: a feed can
// hold many trip cards at once, and standing up a WebGL map instance per
// card (each with its own GL context and tile fetches) is drastically more
// expensive than one cached PNG. The interactive map is created only once
// the user actually opens it.
export function TripMapSquare({ visits, center: destination }: TripMapSquareProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const coords = coordsOf(visits);

  // Places cached without coordinates can't be plotted at all — better to
  // render nothing than an empty grey box.
  if (coords.length === 0) return null;

  const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
  // Centre and zoom are decided together — computing them separately is
  // what let an outlier keep control of the zoom after losing the centre.
  const { center, zoom } = frameFor(coords, destination);

  const rated = visits.map((v) => v.rating).filter((r): r is number => r != null);
  const averageRating =
    rated.length > 0 ? rated.reduce((sum, r) => sum + r, 0) / rated.length : null;
  // Each pin carries its own review's score. Previously every pin was flat
  // cream, which told you where the trip went but nothing about how it
  // went — and the Static API takes the colour per marker for free, so the
  // information was being thrown away for nothing. Unrated stays cream.
  const pins = coords
    .slice(0, MAX_PINS)
    .map((c) => {
      const tint = c.rating != null ? readableColorForRating(c.rating).slice(1) : 'EAE7CF';
      return `pin-s+${tint}(${c.lng.toFixed(5)},${c.lat.toFixed(5)})`;
    })
    .join(',');
  const staticUrl = token
    ? `https://api.mapbox.com/styles/v1/${STATIC_STYLE}/static/${pins}/${center.lng.toFixed(5)},${center.lat.toFixed(5)},${zoom.toFixed(2)}/${SQUARE_SIZE}x${SQUARE_SIZE}${RETINA}?access_token=${token}&attribution=false&logo=false`
    : undefined;

  return (
    <>
      <Pressable onPress={() => setIsExpanded((open) => !open)} hitSlop={4}>
        <LoadableImage
          source={staticUrl ? { uri: staticUrl } : undefined}
          style={[
            styles.square,
            averageRating != null && { borderColor: readableColorForRating(averageRating) },
          ]}
        />
      </Pressable>

      {/* Fullscreen rather than an inline panel — the point of opening it is
          to actually read the geography of the trip, which a short strip
          inside a feed card can't give you. BoardMapView fits the camera to
          every pin's bounds on its own once it has the room. */}
      <Modal
        visible={isExpanded}
        animationType="slide"
        onRequestClose={() => setIsExpanded(false)}>
        <View style={styles.modalRoot}>
          <BoardMapView items={toBoardItems(visits)} />
          <SafeAreaView style={styles.modalBar} pointerEvents="box-none">
            <Pressable onPress={() => setIsExpanded(false)} hitSlop={12} style={styles.closeButton}>
              <ThemedText type="link">← Close map</ThemedText>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  square: {
    width: SQUARE_SIZE,
    height: SQUARE_SIZE,
    borderRadius: Spacing.two,
    // Transparent by default so an unrated trip keeps the same footprint as
    // a rated one — only the colour appears, never the layout shift.
    borderWidth: BORDER_WIDTH,
    borderColor: 'transparent',
  },
  // BoardMapView is flex:1, so it needs a parent with a real height to fill
  // rather than collapsing to nothing — here that's the whole screen.
  modalRoot: {
    flex: 1,
  },
  // Overlaid on the map rather than stacked above it, so the map keeps the
  // full screen; box-none lets pans through everywhere except the button.
  modalBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: Spacing.three,
  },
  closeButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
