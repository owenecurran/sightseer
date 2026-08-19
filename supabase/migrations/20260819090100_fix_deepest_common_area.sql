-- Two fixes to trip area labeling, both caught by testing the helper
-- against real place rows rather than by reading it back.
--
-- 1. The `having` clause compared `count(distinct leaf_id)` against
--    `cardinality(p_ids)`. Callers pass one place id PER VISIT, so a trip
--    with 5 reviews across 3 places passed a 5-element array whose distinct
--    leaf count could only ever reach 3 — the equality never held and the
--    function returned NULL for essentially every real trip. Now compared
--    against the DISTINCT number of places actually resolvable from the
--    input (also guarding against ids that don't exist).
--
-- 2. NULL is still a legitimate result: the hierarchy tops out at country,
--    so a trip spanning two countries genuinely has no common ancestor.
--    get_trips_for_users joined the area with an INNER join, which silently
--    dropped those trips from the feed entirely instead of labeling them
--    more broadly. The function now falls back to whichever country holds
--    the most of the trip's places, so a cross-border trip still gets a
--    name; the RPC's join is left inner deliberately, since the function no
--    longer returns NULL for any non-empty input whose places exist.

create or replace function public.deepest_common_area(p_ids uuid[])
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select id as leaf_id, id as anc_id from public.places where id = any(p_ids)
    union all
    select c.leaf_id, pl.parent_id
    from chain c
    join public.places pl on pl.id = c.anc_id
    where pl.parent_id is not null
  ),
  leaf_count as (
    select count(distinct id) as n from public.places where id = any(p_ids)
  ),
  common as (
    select c.anc_id
    from chain c
    join public.places a on a.id = c.anc_id
    where a.level in ('locality', 'admin_area_1', 'country')
    group by c.anc_id, a.level
    having count(distinct c.leaf_id) = (select n from leaf_count)
    order by case a.level
               when 'locality' then 3
               when 'admin_area_1' then 2
               else 1
             end desc
    limit 1
  ),
  -- Only consulted when nothing contains every place — see note 2 above.
  fallback as (
    select c.anc_id
    from chain c
    join public.places a on a.id = c.anc_id
    where a.level = 'country'
    group by c.anc_id
    order by count(distinct c.leaf_id) desc, c.anc_id
    limit 1
  )
  select anc_id from common
  union all
  select anc_id from fallback where not exists (select 1 from common)
  limit 1;
$$;

-- Belt-and-braces on the caller side too: passing distinct place ids makes
-- the input mean what the function's name implies, independent of the
-- cardinality fix above.
create or replace function public.get_trips_for_users(user_ids uuid[])
returns table (
  user_id uuid,
  trip_key text,
  area_place_id uuid,
  area_name text,
  area_level text,
  start_date date,
  end_date date,
  is_ongoing boolean,
  visit_ids uuid[],
  travel_book_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with av as (
    select v.id, v.user_id, v.visited_on, v.place_id, p.geog
    from public.visits v
    join public.places p on p.id = v.place_id
    where v.user_id = any(user_ids)
  ),
  away as (
    select av.*
    from av
    where exists (select 1 from public.home_locations h where h.user_id = av.user_id)
      and not exists (
        select 1
        from public.home_locations hl
        join public.places hp on hp.id = hl.place_id
        where hl.user_id = av.user_id
          and (
            public.place_has_ancestor(av.place_id, hl.place_id)
            or (
              av.geog is not null
              and hp.geog is not null
              and ST_DWithin(av.geog, hp.geog, 16093)
            )
          )
      )
  ),
  marked as (
    select
      a.*,
      case
        when lag(a.visited_on) over w is null
          or a.visited_on - lag(a.visited_on) over w > 2
        then 1 else 0
      end as new_trip
    from away a
    window w as (partition by a.user_id order by a.visited_on, a.id)
  ),
  seq as (
    select
      m.*,
      sum(m.new_trip) over (
        partition by m.user_id
        order by m.visited_on, m.id
        rows unbounded preceding
      ) as trip_seq
    from marked m
  ),
  agg as (
    select
      s.user_id,
      min(s.visited_on) as start_date,
      max(s.visited_on) as end_date,
      count(*) as visit_count,
      count(distinct s.visited_on) as day_count,
      array_agg(distinct s.place_id) as place_ids,
      array_agg(s.id order by s.visited_on, s.id) as all_visit_ids
    from seq s
    group by s.user_id, s.trip_seq
  )
  select
    a.user_id,
    a.user_id::text || ':' || a.start_date::text as trip_key,
    ar.id as area_place_id,
    ar.name as area_name,
    ar.level as area_level,
    a.start_date,
    a.end_date,
    (a.end_date >= current_date - 3) as is_ongoing,
    vis.visible_ids as visit_ids,
    ov.travel_book_id
  from agg a
  cross join lateral (select public.deepest_common_area(a.place_ids) as id) dca
  join public.places ar on ar.id = dca.id
  cross join lateral (
    select array_agg(u.vid order by u.ord) as visible_ids
    from unnest(a.all_visit_ids) with ordinality as u(vid, ord)
    where exists (
      select 1 from public.visits v2
      where v2.id = u.vid
        and public.can_view_user_content(auth.uid(), v2.user_id)
    )
  ) vis
  left join public.trip_overrides ov
    on ov.user_id = a.user_id and ov.start_date = a.start_date
  where a.visit_count >= 2
    and a.day_count >= 2
    and coalesce(ov.dismissed, false) = false
    and vis.visible_ids is not null;
$$;
