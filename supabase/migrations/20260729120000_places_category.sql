-- Drives tag-chip coloring (blue for water, brown for trails, red for
-- food/drink, default otherwise). Nullable — most places (countries, admin
-- areas, localities, and POIs that don't match a known bucket) have no
-- category and just render as default.
alter table public.places
  add column category text check (category in ('water', 'trail', 'food_drink'));
