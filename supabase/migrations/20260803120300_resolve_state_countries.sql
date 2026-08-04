-- Batched state/country resolution for a list of place ids, replacing an
-- earlier attempt at a PostgREST nested self-embed
-- (places!place_id(...parent:places!places_parent_id_fkey(...))) that turned
-- out not to work on this project: confirmed live that a plain column-name
-- hint (places!parent_id) resolves to the *children* direction (reverse FK),
-- not the parent one, and the constraint-name hint
-- (places!places_parent_id_fkey) doesn't resolve at all ("no matches found"
-- in the schema cache, even after a manual reload). A recursive SQL
-- function sidesteps PostgREST's embedding resolution entirely — still one
-- round trip for a whole list (no N+1), just via .rpc() instead of a nested
-- select. Hierarchy is at most 3 parent hops deep by design
-- (poi/trail -> locality -> admin_area_1 -> country, see
-- cachePlaceHierarchy), so the recursion is always short and bounded.
create function public.resolve_state_countries(place_ids uuid[])
returns table (place_id uuid, state_name text, country_name text)
language sql
stable
security definer
set search_path = public
as $$
  with recursive ancestry as (
    select p.id as origin_id, p.id, p.parent_id, p.level, p.name
    from public.places p
    where p.id = any(place_ids)
    union all
    select a.origin_id, p.id, p.parent_id, p.level, p.name
    from ancestry a
    join public.places p on p.id = a.parent_id
  )
  select
    origin_id as place_id,
    max(name) filter (where level = 'admin_area_1') as state_name,
    max(name) filter (where level = 'country') as country_name
  from ancestry
  group by origin_id;
$$;

grant execute on function public.resolve_state_countries(uuid[]) to authenticated;
