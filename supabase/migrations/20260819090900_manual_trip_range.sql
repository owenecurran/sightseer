-- Manual trips span their declared date range.
--
-- createManualTrip writes an anchor row with manual_end_date, but the RPC
-- only ever built trips out of single-day outing clusters — so a manual
-- trip surfaced nothing unless two reviews happened to fall on its exact
-- start date. It now collects every review inside the range, and takes
-- precedence over anything auto-detected within it so the same reviews
-- can't appear as two overlapping trips.
drop function if exists public.get_trips_for_users(uuid[]);

create function public.get_trips_for_users(user_ids uuid[])
returns table (
  user_id uuid,
  trip_key text,
  kind text,
  area_place_id uuid,
  area_name text,
  area_level text,
  area_lat double precision,
  area_lng double precision,
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
      array_agg(s.place_id) as place_ids,
      array_agg(s.id order by s.visited_on, s.id) as all_visit_ids
    from seq s
    group by s.user_id, s.trip_seq
    having count(*) >= 2 and count(distinct s.visited_on) >= 2
  ),
  outings as (
    select
      a.user_id,
      'outing'::text as kind,
      a.visited_on as start_date,
      a.visited_on as end_date,
      count(*) as visit_count,
      1::bigint as day_count,
      array_agg(a.place_id) as place_ids,
      array_agg(a.id order by a.id) as all_visit_ids
    from av a
    group by a.user_id, a.visited_on
    -- 2 is the floor for a promoted day (the user can confirm a pair);
    -- an unpromoted day still needs 3 to group on its own. The promoted
    -- check happens in outings_kept below, which has the override joined.
    having count(*) >= 2
  ),
  outings_kept as (
    select
      o.user_id,
      -- A promoted outing IS a trip as far as the rest of the app is
      -- concerned: it groups, labels and converts to a travel book
      -- identically. Only how it was decided differs.
      case when ov.promoted then 'trip'::text else o.kind end as kind,
      o.start_date,
      -- A manual anchor carries its own end date; a promoted single day
      -- still ends when it started.
      coalesce(ov.manual_end_date, o.end_date) as end_date,
      o.visit_count,
      o.day_count,
      o.place_ids,
      o.all_visit_ids
    from outings o
    left join public.trip_overrides ov
      on ov.user_id = o.user_id and ov.start_date = o.start_date
    where not exists (
      select 1 from trips t
      where t.user_id = o.user_id
        and o.start_date between t.start_date and t.end_date
    )
    -- Unpromoted days still need 3 reviews to group by themselves.
    and (ov.promoted or o.visit_count >= 3)
  ),
  -- A manually created trip declares its own date range, so its reviews
  -- come from that RANGE rather than from a single-day cluster. Without
  -- this a manual trip found nothing unless two reviews happened to land on
  -- its exact start date.
  manual as (
    select
      ov.user_id,
      'trip'::text as kind,
      ov.start_date,
      ov.manual_end_date as end_date,
      count(v.id) as visit_count,
      count(distinct v.visited_on) as day_count,
      array_agg(v.place_id) as place_ids,
      array_agg(v.id order by v.visited_on, v.id) as all_visit_ids
    from public.trip_overrides ov
    join public.visits v
      on v.user_id = ov.user_id
     and v.visited_on between ov.start_date and ov.manual_end_date
    where ov.manual_end_date is not null
      and ov.user_id = any(user_ids)
      and coalesce(ov.dismissed, false) = false
    group by ov.user_id, ov.start_date, ov.manual_end_date
  ),
  -- A manual range wins over anything detected inside it, so the same
  -- reviews never appear as two overlapping trips.
  detected_kept as (
    select t.* from trips t
    where not exists (
      select 1 from manual m
      where m.user_id = t.user_id
        and t.start_date between m.start_date and m.end_date
    )
    union all
    select o.* from outings_kept o
    where not exists (
      select 1 from manual m
      where m.user_id = o.user_id
        and o.start_date between m.start_date and m.end_date
    )
  ),
  agg as (
    select * from detected_kept
    union all
    select * from manual
  )
  select
    a.user_id,
    a.user_id::text || ':' || a.start_date::text as trip_key,
    a.kind,
    coalesce(ov.display_place_id, dca.id) as area_place_id,
    coalesce(ovp.name, ar.name) as area_name,
    coalesce(ovp.level, ar.level) as area_level,
    -- Follows whichever area is actually displayed, so relabelling a trip
    -- to its state or country recentres the thumbnail to match.
    coalesce(ovp.lat, ar.lat) as area_lat,
    coalesce(ovp.lng, ar.lng) as area_lng,
    dca.id as auto_area_place_id,
    a.start_date,
    a.end_date,
    (a.end_date >= current_date - 3) as is_ongoing,
    vis.visible_ids as visit_ids,
    ov.travel_book_id
  from agg a
  cross join lateral (select public.majority_area(a.place_ids) as id) dca
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
