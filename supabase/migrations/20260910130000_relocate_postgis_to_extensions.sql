-- Move PostGIS out of public and into the extensions schema.
--
-- public is the schema PostgREST exposes, so everything PostGIS installs there
-- is API surface: spatial_ref_sys, geometry_columns and geography_columns all
-- turn up in the generated types, and the advisor's "RLS disabled in public"
-- lint fires on a table we neither created nor own. The preceding migration
-- (20260910120000) revoked anon/authenticated access to close the actual
-- exposure; this one removes the cause, and supersedes it. That migration is
-- kept because a sequential replay still passes through a state where PostGIS
-- is in public, and it is correct there.
--
-- PostGIS is `relocatable = false`, so `alter extension ... set schema` is
-- rejected outright. The only route is drop and recreate, which is why this is
-- happening pre-launch rather than later: after launch it stops being an option
-- at all.
--
-- Deliberately NOT `drop extension postgis cascade`. An audit of pg_depend
-- against the live database found exactly three dependent objects:
--
--     column geog of table places
--     column boundary_geometry of table places
--     index places_geog_idx
--
-- Those three are dropped explicitly below, after which a bare `drop extension
-- postgis` succeeds. Keeping it bare is the safety net: if anything else has
-- appeared since the audit, Postgres refuses and names it, instead of cascade
-- quietly destroying it.
--
-- What the audit also established, and what makes this migration shaped the way
-- it is: none of the seven functions that use PostGIS are recorded as
-- dependencies. Postgres only parses a SQL function body for dependencies when
-- it uses the BEGIN ATOMIC form; these all use classic `as $$ ... $$` string
-- bodies, which are as opaque to the dependency tracker as plpgsql. So no
-- function is dropped by this migration, nothing warns us about them, and every
-- one of them would resolve ST_* against a schema that no longer holds it —
-- failing at call time, in production, rather than here.
--
-- They are repaired with `alter function ... set search_path` rather than
-- `create or replace`. The bodies do not need to change; only name resolution
-- does. Retyping user_area_ratings' recursive CTEs to change one clause would
-- be the riskiest thing in this file.
--
-- On the data. geog is derived — set_places_geog computes it from lat/lng — so
-- dropping it costs nothing that an update cannot rebuild. boundary_geometry is
-- not: store_place_boundary simplifies incoming GeoJSON and keeps only the
-- result, so the source is gone and the only fallback is re-fetching from
-- Nominatim at its one-request-per-second policy. That is 13 rows today and
-- would be far more later, so it is stashed as text (which survives the
-- extension drop) before anything is dropped, and the stash is asserted
-- complete before the point of no return.
--
-- boundary_geojson is kept afterwards rather than dropped. It removes the
-- fragility this migration just had to work around: boundaries become
-- reconstructible from our own database instead of from a rate-limited third
-- party.
--
-- pg_trgm stays in public. It is in the same position, but it exposes no tables,
-- so it draws no lint and moving it would mean rebuilding three more indexes for
-- no gain.

-- public first so the pre-drop ST_AsGeoJSON below resolves, extensions second so
-- everything after the move does. Covers both halves of this migration.
set local search_path = public, extensions;

-- =========================================================================
-- stash the boundaries
-- =========================================================================

alter table public.places add column if not exists boundary_geojson text;

update public.places
set boundary_geojson = ST_AsGeoJSON(boundary_geometry)
where boundary_geometry is not null
  and boundary_geojson is null;

-- The point of no return is the next section. Refuse to reach it unless every
-- geometry has a text counterpart — a rolled-back migration is recoverable,
-- thirteen silently lost boundaries are not.
do $$
declare
  geometries int;
  stashed    int;
begin
  select count(boundary_geometry), count(boundary_geojson)
  into geometries, stashed
  from public.places;

  if stashed < geometries then
    raise exception
      'boundary stash incomplete: % geometries, % stashed as geojson', geometries, stashed;
  end if;

  raise notice 'stashed % boundary geometries as geojson', stashed;
end;
$$;

-- =========================================================================
-- drop the three dependent objects
-- =========================================================================

drop index if exists public.places_geog_idx;

alter table public.places
  drop column geog,
  drop column boundary_geometry;

-- =========================================================================
-- relocate the extension
-- =========================================================================

-- Bare, not cascade. See the header: this failing is the desired behaviour if
-- the dependency set has changed since the audit.
drop extension postgis;

-- Already present on this project (Supabase provisions it for pgcrypto and
-- friends); the guard is for a database built from migrations alone.
create schema if not exists extensions;

create extension postgis with schema extensions;

-- =========================================================================
-- rebuild the columns, index and data
-- =========================================================================

-- Schema-qualified rather than leaning on search_path, so these two lines stay
-- correct regardless of how the session that runs them is configured.
alter table public.places
  add column geog extensions.geography(Point, 4326),
  add column boundary_geometry extensions.geometry(MultiPolygon, 4326);

create index places_geog_idx on public.places using gist (geog);

-- Same expression as set_places_geog, applied in bulk. The trigger keeps every
-- subsequent write in step.
update public.places
set geog = extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography
where lat is not null
  and lng is not null;

-- Straight back from the stash. Not re-simplified: store_place_boundary already
-- simplified this on the way in, and doing it twice would degrade the outline
-- further for no reason.
update public.places
set boundary_geometry = extensions.ST_Multi(
      extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(boundary_geojson), 4326)
    )
where boundary_geojson is not null;

do $$
declare
  stashed  int;
  restored int;
begin
  select count(boundary_geojson), count(boundary_geometry)
  into stashed, restored
  from public.places;

  if restored < stashed then
    raise exception
      'boundary restore incomplete: % stashed, % restored as geometry', stashed, restored;
  end if;

  raise notice 'restored % boundary geometries', restored;
end;
$$;

-- =========================================================================
-- repair the seven functions
-- =========================================================================

-- Four of these had `set search_path = public`, which is now wrong rather than
-- merely incomplete. Three had none at all and were relying on the caller's —
-- which for a PostgREST request happens to include extensions, and for a
-- trigger or an internal call does not. Pinning all seven explicitly makes them
-- independent of how they are reached.

-- ST_SetSRID, ST_MakePoint, ::geography — the trigger behind places.geog.
alter function public.set_places_geog()
  set search_path = public, extensions;

-- ST_Multi, ST_SimplifyPreserveTopology, ST_SetSRID, ST_GeomFromGeoJSON.
alter function public.store_place_boundary(uuid, jsonb)
  set search_path = public, extensions;

-- ST_MakeEnvelope, and the && operator, which needs resolving no less than the
-- functions do.
alter function public.get_nearby_reviewed_places(
  double precision, double precision, double precision, double precision
) set search_path = public, extensions;

-- ST_DWithin, ST_Distance.
alter function public.get_trip_suggestion(uuid, date)
  set search_path = public, extensions;

-- ST_DWithin.
alter function public.get_trips_for_users(uuid[])
  set search_path = public, extensions;

-- ST_AsGeoJSON.
alter function public.get_visited_regions(uuid)
  set search_path = public, extensions;

-- ST_DWithin.
alter function public.is_home_place(uuid, uuid)
  set search_path = public, extensions;
