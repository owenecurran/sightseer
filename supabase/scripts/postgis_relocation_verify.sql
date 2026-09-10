-- Run AFTER the relocation migration. Wrapped in a transaction that rolls back,
-- so the two write paths are exercised without persisting anything.

begin;

-- ── 1. postgis is in extensions, and nothing spatial is left in public ───
select e.extname, e.extversion, n.nspname as schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname like 'postgis%';

-- Expect zero rows: spatial_ref_sys / geometry_columns / geography_columns
-- should all have moved out of the exposed schema.
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('spatial_ref_sys', 'geometry_columns', 'geography_columns');

-- ── 2. data survived ────────────────────────────────────────────────────
-- Expect geog=84, boundary=13, geojson=13 (matching the pre-migration audit).
select
  count(*)                  as places_total,
  count(geog)               as with_geog,
  count(boundary_geometry)  as with_boundary,
  count(boundary_geojson)   as with_geojson
from public.places;

-- ── 3. the index is back, on the relocated type ─────────────────────────
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and indexname = 'places_geog_idx';

-- ── 4. all seven functions carry the new search_path ────────────────────
-- Every row should show search_path=public, extensions.
select p.proname, array_to_string(p.proconfig, ' | ') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'set_places_geog', 'store_place_boundary', 'get_nearby_reviewed_places',
    'get_trip_suggestion', 'get_trips_for_users', 'get_visited_regions',
    'is_home_place'
  )
order by p.proname;

-- ── 5. actually call them ───────────────────────────────────────────────
-- The only test that catches a resolution failure. Each must return without
-- erroring; empty results are fine.
select count(*) as nearby_ok
from public.get_nearby_reviewed_places(-93.3, 44.9, -93.2, 45.0);

select public.is_home_place(
  (select id from public.users limit 1),
  (select id from public.places where geog is not null limit 1)
) as is_home_place_ok;

select count(*) as visited_regions_ok
from public.get_visited_regions((select id from public.users limit 1));

select count(*) as trip_suggestion_ok
from public.get_trip_suggestion((select id from public.users limit 1), current_date);

select count(*) as trips_for_users_ok
from public.get_trips_for_users(array(select id from public.users limit 5));

-- ── 6. the two write paths (rolled back) ────────────────────────────────
-- Fires set_places_geog without changing anything meaningful.
update public.places
set lat = lat
where lat is not null
  and id = (select id from public.places where lat is not null limit 1);

select 'set_places_geog_ok' as trigger_check;

-- Exercises store_place_boundary end to end.
select public.store_place_boundary(
  (select id from public.places limit 1),
  '{"type":"MultiPolygon","coordinates":[[[[0,0],[0,1],[1,1],[1,0],[0,0]]]]}'::jsonb
) as store_boundary_ok;

rollback;
