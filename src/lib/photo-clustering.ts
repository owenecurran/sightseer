export type GeoTaggedAsset = {
  uri: string;
  width: number;
  height: number;
  mimeType?: string;
  lat: number | null;
  lng: number | null;
};

export type PhotoCluster = {
  lat: number | null;
  lng: number | null;
  photos: GeoTaggedAsset[];
};

// Same radius findNearbyPlaces (google-places.ts) searches within, so "same
// cluster" and "same nearby-search result" stay consistent.
const CLUSTER_RADIUS_METERS = 150;
const EARTH_RADIUS_METERS = 6371000;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GPS keys are conventionally GPSLatitude/GPSLongitude/GPSLatitudeRef/
// GPSLongitudeRef (unsigned magnitude + N/S/E/W sign ref) but this is NOT
// guaranteed by expo-image-picker's type (exif?: Record<string, any> | null,
// ImagePicker.types.d.ts:283) — validate everything at runtime, never
// assume presence or shape.
export function extractGpsFromExif(exif: Record<string, unknown> | null | undefined): { lat: number; lng: number } | null {
  if (!exif) return null;

  const latValue = exif.GPSLatitude;
  const lngValue = exif.GPSLongitude;
  if (typeof latValue !== 'number' || typeof lngValue !== 'number') return null;

  const latRef = typeof exif.GPSLatitudeRef === 'string' ? exif.GPSLatitudeRef : 'N';
  const lngRef = typeof exif.GPSLongitudeRef === 'string' ? exif.GPSLongitudeRef : 'E';

  const lat = latRef.toUpperCase() === 'S' ? -Math.abs(latValue) : Math.abs(latValue);
  const lng = lngRef.toUpperCase() === 'W' ? -Math.abs(lngValue) : Math.abs(lngValue);

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// Greedy threshold clustering: each photo joins the first existing cluster
// whose centroid it's within CLUSTER_RADIUS_METERS of, else starts a new
// one. No-GPS photos (lat/lng null) never join any cluster — they fall
// through as single-photo clusters of their own, with no special-case
// branch needed (draft_visits.place_id mirrors visits.place_id's singular
// shape, so grouping unrelated unlocated photos under one null-place draft
// isn't a shape this schema supports anyway).
export function clusterPhotosByLocation(assets: GeoTaggedAsset[]): PhotoCluster[] {
  const clusters: PhotoCluster[] = [];

  for (const asset of assets) {
    if (asset.lat == null || asset.lng == null) {
      clusters.push({ lat: null, lng: null, photos: [asset] });
      continue;
    }

    const match = clusters.find(
      (cluster) =>
        cluster.lat != null &&
        cluster.lng != null &&
        haversineMeters(cluster.lat, cluster.lng, asset.lat!, asset.lng!) <= CLUSTER_RADIUS_METERS
    );

    if (match) {
      match.photos.push(asset);
    } else {
      clusters.push({ lat: asset.lat, lng: asset.lng, photos: [asset] });
    }
  }

  return clusters;
}
