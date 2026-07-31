-- Lightweight marker data for the Locations map's "browse" mode: one row per
-- place with at least one *visible* review inside the given viewport bounds.
-- `security invoker` (the default — no `security definer` here, matching
-- get_place_aggregate_rating/get_visited_regions), so `visits_select`'s RLS
-- policy (can_view_user_content) applies automatically via the caller's
-- auth.uid() — no need to duplicate that visibility logic here.
--
-- Uses the `&&` bounding-box overlap operator against `places.geog`
-- (a geography(Point,4326) column already GiST-indexed via places_geog_idx),
-- not naive lat/lng BETWEEN filtering.
create or replace function public.get_nearby_reviewed_places(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table (
  place_id uuid,
  name text,
  lat double precision,
  lng double precision,
  avg_rating numeric,
  review_count bigint
)
language sql
stable
as $$
  select
    p.id as place_id,
    p.name,
    p.lat,
    p.lng,
    avg(v.rating)::numeric as avg_rating,
    count(v.id) as review_count
  from public.visits v
  join public.places p on p.id = v.place_id
  where p.geog && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  group by p.id, p.name, p.lat, p.lng
  limit 60;
$$;

grant execute on function public.get_nearby_reviewed_places(
  double precision, double precision, double precision, double precision
) to authenticated;
