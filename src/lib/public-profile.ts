import type { Database } from '@/lib/database.types';

// The columns of `users` that anyone may read.
//
// MIRRORS THE GRANT in 20260930130000_restrict_users_columns.sql. Every other
// column on that table is reachable only through a definer function now, so
// asking for one that is not here fails with "permission denied for column"
// rather than quietly returning null — which is the behaviour you want, and
// it means this list and that grant have to move together.
//
// One literal with `as const`, not a concatenation: supabase-js infers the
// row shape by parsing this string at the TYPE level, and a built-up string
// is just `string` to the compiler, which collapses the result to
// GenericStringError.
export const PUBLIC_USER_COLUMNS =
  'id, handle, name, avatar_r2_key, bio, is_private, created_at, home_place_id, show_map, map_default_center_lat, map_default_center_lng, map_default_zoom, map_default_layers, profile_section_order' as const;

// Somebody else's profile, as this app is allowed to see it.
export type PublicProfile = Pick<
  Database['public']['Tables']['users']['Row'],
  | 'id'
  | 'handle'
  | 'name'
  | 'avatar_r2_key'
  | 'bio'
  | 'is_private'
  | 'created_at'
  | 'home_place_id'
  | 'show_map'
  | 'map_default_center_lat'
  | 'map_default_center_lng'
  | 'map_default_zoom'
  | 'map_default_layers'
  | 'profile_section_order'
>;
