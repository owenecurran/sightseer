-- Trip detection: groups a user's reviews into "trips" whenever they're
-- posted away from that user's own home locations.
--
-- Deliberately derived from `visits` rather than from device location: the
-- app has no background location tracking (getCurrentLocation is a
-- foreground, opportunistic call used only to center the map picker), and
-- adding it would mean new permissions, a native rebuild, battery handling,
-- and a real privacy escalation — none of which is necessary, because a
-- visit already carries the place it happened at, and places already form a
-- country > admin_area_1 > locality > poi hierarchy with coordinates.
--
-- Trips themselves are NOT stored. They're recomputed from visits on every
-- read (see get_trips_for_users below), so a newly posted review extends
-- the right trip with no sync/backfill step. Only user *overrides* are
-- persisted (trip_overrides), keyed by the trip's stable anchor.

-- =========================================================================
-- home_locations — up to 5 per user, changeable at any time
-- =========================================================================
create table public.home_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- Whatever level the user picked, though the picker steers toward
  -- localities (cities). Matching handles any level — see is_home_visit.
  place_id uuid not null references public.places (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, place_id)
);
create index home_locations_user_idx on public.home_locations (user_id);

-- A hard cap enforced server-side, not just in the picker UI — the client
-- can't be the only thing holding this invariant, since a stale/duplicated
-- client could otherwise push a 6th past it.
create or replace function public.enforce_home_location_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.home_locations where user_id = new.user_id) >= 5 then
    raise exception 'You can have at most 5 home locations.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger home_locations_limit
  before insert on public.home_locations
  for each row execute function public.enforce_home_location_limit();

alter table public.home_locations enable row level security;

-- Owner-only, in both directions. Where someone lives is meaningfully more
-- sensitive than the content built on top of it, so home locations are
-- never readable by anyone else — trip grouping stays visible to everyone
-- purely because get_trips_for_users below is `security definer` and
-- returns only the resulting groupings, never the home locations that
-- produced them.
create policy "home_locations_select_own" on public.home_locations
  for select using (auth.uid() = user_id);
create policy "home_locations_insert_own" on public.home_locations
  for insert with check (auth.uid() = user_id);
create policy "home_locations_delete_own" on public.home_locations
  for delete using (auth.uid() = user_id);

-- =========================================================================
-- trip_overrides — the only persisted part of a trip
-- =========================================================================
-- Keyed by (user_id, start_date): a trip's start is its stable anchor.
-- Posting more reviews extends a trip's END, which is why end_date is
-- deliberately not part of the key — using the full range would orphan the
-- override every time the trip grew. Posting a review *earlier* than an
-- existing trip's start does re-anchor it (and orphans any override), which
-- is rare enough to accept over the complexity of a real trip-identity
-- table that would need reconciling on every write.
create table public.trip_overrides (
  user_id uuid not null references public.users (id) on delete cascade,
  start_date date not null,
  -- Set once the user converts this trip into a travel book, so the feed
  -- can link to it instead of offering to create it again.
  travel_book_id uuid references public.travel_books (id) on delete set null,
  -- Phase 2 knobs, unused by app code today but part of the same row so
  -- adding them later is a client change, not another migration: which
  -- hierarchy level to label the trip with, and "this isn't a trip".
  display_place_id uuid references public.places (id) on delete set null,
  dismissed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, start_date)
);

alter table public.trip_overrides enable row level security;

-- Readable by anyone who can see that user's content, since the feed shows
-- their trips (and needs travel_book_id to render the link); writable only
-- by the owner.
create policy "trip_overrides_select" on public.trip_overrides
  for select using (public.can_view_user_content(auth.uid(), user_id));
create policy "trip_overrides_insert_own" on public.trip_overrides
  for insert with check (auth.uid() = user_id);
create policy "trip_overrides_update_own" on public.trip_overrides
  for update using (auth.uid() = user_id);
create policy "trip_overrides_delete_own" on public.trip_overrides
  for delete using (auth.uid() = user_id);

-- =========================================================================
-- Place-hierarchy helpers
-- =========================================================================

-- Whether `p_id` is `anc_id` or sits anywhere beneath it. Lets a home
-- location saved as a city match every POI reviewed inside that city,
-- regardless of how deep the chain runs.
create or replace function public.place_has_ancestor(p_id uuid, anc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select p_id as id
    union all
    select pl.parent_id
    from chain c
    join public.places pl on pl.id = c.id
    where pl.parent_id is not null
  )
  select exists (select 1 from chain where id = anc_id);
$$;

-- The deepest place that every one of `p_ids` sits inside — "Lisbon" when
-- a trip stayed in one city, "Portugal" once it spans two. This is what
-- makes the trip's own header pick the most relevant level on its own
-- rather than always naming a country or always naming a city.
--
-- Restricted to locality-or-broader so a trip spent entirely at one POI
-- gets labeled with its city rather than with the venue itself.
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
  )
  select c.anc_id
  from chain c
  join public.places a on a.id = c.anc_id
  where a.level in ('locality', 'admin_area_1', 'country')
  group by c.anc_id, a.level
  having count(distinct c.leaf_id) = cardinality(p_ids)
  order by case a.level
             when 'locality' then 3
             when 'admin_area_1' then 2
             else 1
           end desc
  limit 1;
$$;

-- =========================================================================
-- get_trips_for_users — the whole detection algorithm
-- =========================================================================
-- security definer for two independent reasons:
--   1. It reads home_locations for users other than the caller, which RLS
--      correctly forbids directly. Only the derived grouping escapes.
--   2. Trip *boundaries* are computed from ALL of the author's visits, so
--      every viewer sees the same start/end dates rather than a range that
--      silently shrinks to whichever visits that particular viewer happens
--      to be allowed to see. The visit ids returned are still filtered
--      through can_view_user_content, so this widens no one's access — it
--      only keeps the grouping itself consistent.
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
    -- A user with no home locations set has no basis for "away" at all, so
    -- none of their reviews group into trips until they add one.
    where exists (select 1 from public.home_locations h where h.user_id = av.user_id)
      and not exists (
        select 1
        from public.home_locations hl
        join public.places hp on hp.id = hl.place_id
        where hl.user_id = av.user_id
          and (
            -- Inside a home city (or the saved place itself, at any level).
            public.place_has_ancestor(av.place_id, hl.place_id)
            -- ...or close enough to it to still be "around home" — 10 miles
            -- from the home city, per direct preference. Covers suburbs and
            -- neighboring towns, which the hierarchy check alone misses
            -- since they're separate localities.
            or (
              av.geog is not null
              and hp.geog is not null
              and ST_DWithin(av.geog, hp.geog, 16093)
            )
          )
      )
  ),
  -- A new trip starts whenever there's a gap of more than 2 days between
  -- consecutive away-reviews. Small enough that two separate weekends away
  -- don't merge, generous enough that a travel day with nothing posted
  -- doesn't split one trip in half.
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
      array_agg(s.place_id) as place_ids,
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
    -- Still ongoing if the most recent review is recent enough that more
    -- are plausibly still coming. The feed renders these day-by-day and
    -- only collapses them into one block once the trip has settled.
    (a.end_date >= current_date - 3) as is_ongoing,
    vis.visible_ids as visit_ids,
    ov.travel_book_id
  from agg a
  cross join lateral (select public.deepest_common_area(a.place_ids) as id) dca
  join public.places ar on ar.id = dca.id
  cross join lateral (
    select array_agg(vid order by ord) as visible_ids
    from unnest(a.all_visit_ids) with ordinality as u(vid, ord)
    where exists (
      select 1 from public.visits v2
      where v2.id = u.vid
        and public.can_view_user_content(auth.uid(), v2.user_id)
    )
  ) vis
  left join public.trip_overrides ov
    on ov.user_id = a.user_id and ov.start_date = a.start_date
  -- Two reviews across two separate days is the floor for calling
  -- something a trip. A single day away is the "night out on the town"
  -- case, deliberately left ungrouped for now.
  where a.visit_count >= 2
    and a.day_count >= 2
    and coalesce(ov.dismissed, false) = false
    and vis.visible_ids is not null;
$$;

grant execute on function public.get_trips_for_users(uuid[]) to authenticated;
grant execute on function public.place_has_ancestor(uuid, uuid) to authenticated;
grant execute on function public.deepest_common_area(uuid[]) to authenticated;
