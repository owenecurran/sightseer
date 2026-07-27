-- Separate from the existing `geog` point column — different purpose
-- (a point vs. a region outline), kept distinct rather than overloading one
-- column with two shapes.
alter table public.places add column boundary_geometry geometry(MultiPolygon, 4326);

-- places has no client-facing UPDATE policy at all ("places are append-only
-- from the client; corrections happen server-side only" — see the RLS
-- migration) — security definer is what lets this write despite that,
-- matching the established pattern for this exact gap rather than opening
-- a new client-writable UPDATE policy just for this one column.
create or replace function public.store_place_boundary(place_id uuid, geojson jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.places
  set boundary_geometry = ST_Multi(
    ST_SimplifyPreserveTopology(ST_SetSRID(ST_GeomFromGeoJSON(geojson::text), 4326), 0.01)
  )
  where id = place_id;
end;
$$;

grant execute on function public.store_place_boundary(uuid, jsonb) to authenticated;

-- Deliberately NOT security definer — inherits the caller's own RLS on
-- `visits`, same reasoning already used for get_place_aggregate_rating:
-- if the caller can't see one of profile_user_id's visits, it simply
-- doesn't contribute a region here either. Walks each visible visit's
-- place up its parent chain to find every distinct country/admin_area_1
-- ancestor (a visit to a POI/locality counts toward its country, same
-- "counts toward ancestor" idea as the aggregate-rating recursive CTE).
create or replace function public.get_visited_regions(profile_user_id uuid)
returns table (id uuid, name text, level text, boundary_geojson text)
language sql
stable
as $$
  with recursive visited as (
    select distinct v.place_id
    from public.visits v
    where v.user_id = profile_user_id
  ),
  ancestors as (
    select p.id, p.parent_id, p.level, p.name
    from public.places p
    join visited on visited.place_id = p.id
    union
    select parent.id, parent.parent_id, parent.level, parent.name
    from public.places parent
    join ancestors a on a.parent_id = parent.id
  )
  select distinct a.id, a.name, a.level, ST_AsGeoJSON(pl.boundary_geometry) as boundary_geojson
  from ancestors a
  join public.places pl on pl.id = a.id
  where a.level in ('country', 'admin_area_1');
$$;

grant execute on function public.get_visited_regions(uuid) to authenticated;
