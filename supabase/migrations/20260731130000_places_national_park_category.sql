-- Adds a fourth category (alongside water/trail/food_drink from
-- 20260729120000_places_category.sql) so the profile map's "National Parks"
-- overlay toggle has something real to filter on. Google Places' own type
-- for this is literally `national_park` (see categorizeFromTypes in
-- src/lib/places-cache.ts), so classification needs no new heuristic.
alter table public.places
  drop constraint places_category_check;

alter table public.places
  add constraint places_category_check
  check (category in ('water', 'trail', 'food_drink', 'national_park'));
