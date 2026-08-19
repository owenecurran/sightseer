-- Two additions to trip detection:
--
-- 1. ADJUSTABLE LEVEL. deepest_common_area picks the most relevant place on
--    its own, but the user gets the final say — trip_overrides.display_place_id
--    (added in the first migration, unused until now) wins when set. The
--    picker needs to know what the alternatives are, hence get_place_ancestry.
--
-- 2. OUTINGS. Once somewhere becomes a home location its clusters stop
--    reading as trips — but a dense single day still deserves grouping
--    ("a night out on the town"). So an outing is >= 3 reviews on ONE day,
--    evaluated over ALL visits rather than only away-from-home ones, and
--    excluding any day already inside a real trip so a busy travel day
--    isn't double-counted as both.

-- The locality -> admin_area_1 -> country chain above (and including) a
-- place, deepest first. Powers the "show this trip as a city / state /
-- country" picker; returns only the levels a trip can actually be labeled
-- with, matching deepest_common_area's own restriction.
create or replace function public.get_place_ancestry(p_id uuid)
returns table (id uuid, name text, level text, depth int)
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select pl.id, pl.name, pl.level, pl.parent_id, 0 as depth
    from public.places pl
    where pl.id = p_id
    union all
    select pl.id, pl.name, pl.level, pl.parent_id, c.depth + 1
    from chain c
    join public.places pl on pl.id = c.parent_id
  )
  select c.id, c.name, c.level, c.depth
  from chain c
  where c.level in ('locality', 'admin_area_1', 'country')
  order by c.depth;
$$;

grant execute on function public.get_place_ancestry(uuid) to authenticated;

-- Postgres won't let create-or-replace change a function's return type, and
-- this adds `kind` and `auto_area_place_id` to the result — so the old
-- signature has to go first. Same (uuid[]) argument list, so this is the
-- exact function being replaced, not a stray overload.
drop function if exists public.get_trips_for_users(uuid[]);

create function public.get_trips_for_users(user_ids uuid[])
returns table (
  user_id uuid,
  trip_key text,
  kind text,
  area_place_id uuid,
  area_name text,
  area_level text,
  -- What detection picked on its own, before any user override. Lets the
  -- client offer "reset to automatic" without recomputing it.
  auto_area_place_id uuid,
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
  trips as (
    select
      s.user_id,
      'trip'::text as kind,
      min(s.visited_on) as start_date,
      max(s.visited_on) as end_date,
      count(*) as visit_count,
      count(distinct s.visited_on) as day_count,
      array_agg(distinct s.place_id) as place_ids,
      array_agg(s.id order by s.visited_on, s.id) as all_visit_ids
    from seq s
    group by s.user_id, s.trip_seq
    having count(*) >= 2 and count(distinct s.visited_on) >= 2
  ),
  -- Every single day dense enough to be worth grouping on its own, from
  -- ALL visits (home included) — see note 2 at the top.
  outings as (
    select
      a.user_id,
      'outing'::text as kind,
      a.visited_on as start_date,
      a.visited_on as end_date,
      count(*) as visit_count,
      1::bigint as day_count,
      array_agg(distinct a.place_id) as place_ids,
      array_agg(a.id order by a.id) as all_visit_ids
    from av a
    group by a.user_id, a.visited_on
    having count(*) >= 3
  ),
  -- A day inside a real trip is already represented by that trip's own
  -- block, so it must not also surface as a standalone outing.
  outings_kept as (
    select o.*
    from outings o
    where not exists (
      select 1 from trips t
      where t.user_id = o.user_id
        and o.start_date between t.start_date and t.end_date
    )
  ),
  agg as (
    select * from trips
    union all
    select * from outings_kept
  )
  select
    a.user_id,
    a.user_id::text || ':' || a.start_date::text as trip_key,
    a.kind,
    -- The user's chosen level wins; detection's own pick is the default.
    coalesce(ov.display_place_id, dca.id) as area_place_id,
    coalesce(ovp.name, ar.name) as area_name,
    coalesce(ovp.level, ar.level) as area_level,
    dca.id as auto_area_place_id,
    a.start_date,
    a.end_date,
    (a.end_date >= current_date - 3) as is_ongoing,
    vis.visible_ids as visit_ids,
    ov.travel_book_id
  from agg a
  cross join lateral (select public.deepest_common_area(a.place_ids) as id) dca
  join public.places ar on ar.id = dca.id
  left join public.trip_overrides ov
    on ov.user_id = a.user_id and ov.start_date = a.start_date
  left join public.places ovp on ovp.id = ov.display_place_id
  cross join lateral (
    select array_agg(u.vid order by u.ord) as visible_ids
    from unnest(a.all_visit_ids) with ordinality as u(vid, ord)
    where exists (
      select 1 from public.visits v2
      where v2.id = u.vid
        and public.can_view_user_content(auth.uid(), v2.user_id)
    )
  ) vis
  where coalesce(ov.dismissed, false) = false
    and vis.visible_ids is not null;
$$;

grant execute on function public.get_trips_for_users(uuid[]) to authenticated;
