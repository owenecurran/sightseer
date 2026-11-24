-- The catalog is populated by Edge Functions using provider responses.
drop policy places_insert_authenticated on public.places;
revoke insert, update on public.places from public, anon, authenticated;
grant select, insert, update on public.places to service_role;

drop function public.upgrade_place_details(uuid, text, text, double precision, double precision);

create or replace function public.store_place_boundary(place_id uuid, geojson jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.places p
  set boundary_geometry = extensions.ST_Multi(extensions.ST_SimplifyPreserveTopology(
    extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geojson::text), 4326), 0.01
  ))
  where p.id = place_id and p.level in ('country', 'admin_area_1')
    and p.boundary_geometry is null;
$$;

revoke all on function public.store_place_boundary(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.store_place_boundary(uuid, jsonb) to service_role;

-- Bound paid provider lookups per signed-in account. Cache hits use no quota.
create function public.take_google_place_lookup_quota()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.take_quota('google_place_lookup', 60);
$$;

revoke all on function public.take_google_place_lookup_quota() from public, anon, authenticated;
grant execute on function public.take_google_place_lookup_quota() to authenticated;

create function public.cache_google_place(
  p_google_place_id text,
  p_lat double precision,
  p_lng double precision,
  p_category text,
  p_path jsonb
)
returns public.places
language plpgsql
set search_path = ''
as $$
declare
  node record;
  cached public.places%rowtype;
  parent uuid;
begin
  -- Serialize the short hierarchy writes. Concurrent provider requests can
  -- share placeholder ancestors even when they select different leaves.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('google place hierarchy', 0));

  select p.* into cached from public.places p where p.google_place_id = p_google_place_id;
  if found then return cached; end if;

  for node in
    select entry->>'level' as level, entry->>'name' as name, i = jsonb_array_length(p_path) as leaf
    from pg_catalog.jsonb_array_elements(p_path) with ordinality as path(entry, i)
    order by i
  loop
    select p.* into cached
    from public.places p
    where p.level = node.level and p.name = node.name
      -- Country parents are set by the continent trigger.
      and (node.level = 'country' or p.parent_id is not distinct from parent)
      and (not node.leaf or p.google_place_id is null)
    order by (p.google_place_id is not null) desc, p.cached_at, p.id
    limit 1;

    if not found then
      insert into public.places (level, name, parent_id, source, google_place_id, category, lat, lng)
      values (
        node.level, node.name, parent, 'google',
        case when node.leaf then p_google_place_id end,
        case when node.leaf then p_category end,
        case when node.leaf then p_lat end,
        case when node.leaf then p_lng end
      )
      returning * into cached;
    elsif node.leaf then
      update public.places p
      set google_place_id = p_google_place_id,
          category = coalesce(p_category, p.category),
          lat = p_lat,
          lng = p_lng
      where p.id = cached.id
      returning p.* into cached;
    end if;

    parent := cached.id;
  end loop;

  return cached;
end;
$$;

revoke all on function public.cache_google_place(text, double precision, double precision, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.cache_google_place(text, double precision, double precision, text, jsonb)
  to service_role;
