-- Label a trip by where it MOSTLY happened, not by the deepest place that
-- happens to contain every last review.
--
-- Real case that motivated this: 7 reviews in Seattle plus a single airport
-- review in Chicago the day before. deepest_common_area is correct by its
-- own definition — the only place containing both is the United States —
-- but "United States" is a useless label for what is obviously a Seattle
-- trip. One layover shouldn't outvote the entire destination.
--
-- So: pick the most specific level that actually holds a MAJORITY of the
-- trip's reviews. Seattle (7/8) wins outright. A trip spread thinly across
-- eight cities in one state has no majority locality, so it falls to the
-- state; one spread across states falls to the country. deepest_common_area
-- is kept as the last resort and is still used elsewhere.
create or replace function public.majority_area(p_ids uuid[])
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    -- WITH ORDINALITY so each *occurrence* is its own row: p_ids is passed
    -- with duplicates on purpose, so a place reviewed seven times counts
    -- seven times rather than once.
    select u.ord, u.pid as leaf_id, u.pid as anc_id
    from unnest(p_ids) with ordinality as u(pid, ord)
    union all
    select c.ord, c.leaf_id, pl.parent_id
    from chain c
    join public.places pl on pl.id = c.anc_id
    where pl.parent_id is not null
  ),
  ranked as (
    select c.anc_id, a.level, count(*) as n
    from chain c
    join public.places a on a.id = c.anc_id
    where a.level in ('locality', 'admin_area_1', 'country')
    group by c.anc_id, a.level
  ),
  total as (select cardinality(p_ids) as n)
  select coalesce(
    -- n * 2 > total is a strict majority without any float division.
    (select r.anc_id from ranked r, total t
      where r.level = 'locality' and r.n * 2 > t.n
      order by r.n desc, r.anc_id limit 1),
    (select r.anc_id from ranked r, total t
      where r.level = 'admin_area_1' and r.n * 2 > t.n
      order by r.n desc, r.anc_id limit 1),
    (select r.anc_id from ranked r
      where r.level = 'country'
      order by r.n desc, r.anc_id limit 1),
    public.deepest_common_area(p_ids)
  );
$$;

grant execute on function public.majority_area(uuid[]) to authenticated;

create or replace function public.get_trips_for_users(user_ids uuid[])
returns table (
  user_id uuid,
  trip_key text,
  kind text,
  area_place_id uuid,
  area_name text,
  area_level text,
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
      -- Deliberately NOT distinct: majority_area weights by how many
      -- reviews each place actually got.
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
    having count(*) >= 3
  ),
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
