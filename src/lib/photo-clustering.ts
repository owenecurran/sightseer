export type GeoTaggedAsset = {
  uri: string;
  width: number;
  height: number;
  mimeType?: string;
  lat: number | null;
  lng: number | null;
  // 'YYYY-MM-DD', from EXIF — see extractDateFromExif. Null when the photo
  // has no EXIF date (e.g. a screenshot, or a photo stripped of metadata).
  takenOn: string | null;
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

// EXIF date tags are conventionally 'YYYY:MM:DD HH:MM:SS' (colons in the
// date portion, not dashes — a real EXIF quirk, not a typo) under
// DateTimeOriginal (when the photo was actually taken) first, falling back
// to the less specific DateTime/CreateDate tags some libraries report
// instead. Same "never assume presence or shape" caution as
// extractGpsFromExif above — bulk-uploaded photos routinely come from
// screenshots or already-stripped files with no EXIF date at all.
export function extractDateFromExif(exif: Record<string, unknown> | null | undefined): string | null {
  if (!exif) return null;

  const raw =
    (typeof exif.DateTimeOriginal === 'string' && exif.DateTimeOriginal) ||
    (typeof exif.DateTime === 'string' && exif.DateTime) ||
    (typeof exif.CreateDate === 'string' && exif.CreateDate) ||
    null;
  if (!raw) return null;

  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

// The date a cluster's draft gets created with — the earliest EXIF date
// among its photos (plain string comparison works: 'YYYY-MM-DD' sorts
// chronologically), so a multi-day cluster lands on when the visit
// started rather than an arbitrary photo's date. Null when none of the
// cluster's photos have a usable EXIF date — the caller falls back to
// today's date in that case, matching this function's pre-EXIF behavior.
export function earliestTakenOn(photos: GeoTaggedAsset[]): string | null {
  const dates = photos.map((p) => p.takenOn).filter((d): d is string => d != null);
  if (dates.length === 0) return null;
  return dates.reduce((earliest, d) => (d < earliest ? d : earliest));
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
