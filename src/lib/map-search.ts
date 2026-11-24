import { supabase } from '@/lib/supabase';

// Map search: the reviewed places inside a map's view, as pins, narrowed by
// rating, popularity and tags. See get_map_places (migration
// 20261123130000_map_search_places.sql) for what counts.

export type MapPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  level: string;
  // Over the reviews the viewer may see. Null when none of them is rated.
  avgRating: number | null;
  reviewCount: number;
};

export type MapBounds = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export type MapSort = 'popular' | 'rating';

export type MapFilters = {
  // Places averaging at least this. Null for any rating.
  minRating: number | null;
  // Places with at least this many reviews.
  minReviews: number;
  // Places with a review carrying every one of these.
  tagSlugs: string[];
  sort: MapSort;
};

export const NO_MAP_FILTERS: MapFilters = { minRating: null, minReviews: 1, tagSlugs: [], sort: 'popular' };

// The choices offered for each filter: few enough to read at a glance.
export const MAP_RATING_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any rating' },
  { value: 6, label: '6 and up' },
  { value: 8, label: '8 and up' },
  { value: 9, label: '9 and up' },
];

export const MAP_REVIEW_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Any' },
  { value: 3, label: '3+ reviews' },
  { value: 10, label: '10+ reviews' },
];

// How many pins one search returns. Enough to fill a city; a wider view
// shows the most popular (or best rated) of them, which is the useful cut.
const RESULT_LIMIT = 150;

type Row = {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  level: string;
  avg_rating: number | string | null;
  review_count: number | string;
};

export async function searchMapPlaces(bounds: MapBounds, filters: MapFilters): Promise<MapPlace[]> {
  const { data, error } = await supabase.rpc('get_map_places' as never, {
    min_lat: bounds.minLat,
    min_lng: bounds.minLng,
    max_lat: bounds.maxLat,
    max_lng: bounds.maxLng,
    min_rating: filters.minRating,
    min_reviews: filters.minReviews,
    tag_slugs: filters.tagSlugs.length > 0 ? filters.tagSlugs : null,
    sort_by: filters.sort,
    result_limit: RESULT_LIMIT,
  } as never);
  if (error) throw error;
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.place_id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    level: row.level,
    avgRating: row.avg_rating == null ? null : Number(row.avg_rating),
    reviewCount: Number(row.review_count),
  }));
}

// Whether any filter is narrowing the search, for saying so on the screen.
export function filtersActive(filters: MapFilters): boolean {
  return filters.minRating != null || filters.minReviews > 1 || filters.tagSlugs.length > 0;
}
