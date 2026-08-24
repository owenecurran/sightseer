-- Every place at or under a given place, with how far below it each one sits.
--
-- The place detail screen listed reviews with a flat `place_id = $1`, which
-- meant a country or continent page showed nothing at all: those rows are
-- almost never reviewed directly (0 of 24 reviews under "United States" and
-- "North America" were on the country/continent row itself). The header
-- above the list already counted recursively, via
-- get_place_aggregate_rating, so the page contradicted itself — "24
-- reviews" over an empty list.
--
-- Returns place ids rather than the visits themselves, deliberately. The
-- caller then queries `visits` normally, so row-level security decides what
-- is visible exactly as it does everywhere else; a security-definer function
-- returning visit rows would have to re-implement can_view_user_content by
-- hand and could silently leak a private review if it ever drifted.
create or replace function public.get_place_descendant_ids(target_place_id uuid)
returns table (place_id uuid, depth int)
language sql
stable
set search_path = public
as $$
  with recursive descendants as (
    select id, 0 as depth
    from public.places
    where id = target_place_id
    union all
    select p.id, d.depth + 1
    from public.places p
    join descendants d on p.parent_id = d.id
    -- The hierarchy is five levels at most (continent > country >
    -- admin_area_1 > locality > poi). The cap is purely so a bad parent_id
    -- cycle degrades to a wrong answer instead of spinning forever.
    where d.depth < 10
  )
  select id, depth from descendants;
$$;

grant execute on function public.get_place_descendant_ids(uuid) to authenticated;
