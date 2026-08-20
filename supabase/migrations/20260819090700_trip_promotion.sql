-- Lets a single day become a trip, on the user's say-so.
--
-- Detection alone can't decide this: three reviews in one day away from home
-- might be a day trip worth grouping, or might just be a busy Saturday. So
-- the app asks, and these columns record the answer.
--
-- Deliberately TWO booleans rather than one tri-state enum, because the
-- third state is the ABSENCE of both: asked-and-ignored has to keep
-- re-suggesting (per direct feedback: "if they don't click no then suggest
-- it again"), and that's the natural meaning of no row / no flags. An enum
-- would need an explicit 'unanswered' value that means the same thing.
alter table public.trip_overrides
  -- User confirmed this cluster is a trip. Promotes a single-day group that
  -- would otherwise only qualify as an outing.
  add column promoted boolean not null default false,
  -- User explicitly said no. Silences the suggestion permanently, unlike
  -- simply never answering it.
  add column trip_prompt_declined boolean not null default false,
  -- Manually created trips only: the user picked the end of the range, so
  -- there are no later reviews to derive it from. Null for detected trips,
  -- which always compute their own.
  add column manual_end_date date;

-- Everything the client needs to decide whether to offer "make this a
-- trip?" for one specific day, and how strongly.
--
-- Returns a row only when there's something worth asking about: reviews
-- away from home on that date, not already declined or promoted, and not
-- already inside a detected multi-day trip.
create or replace function public.get_trip_suggestion(target_user_id uuid, target_date date)
returns table (
  area_place_id uuid,
  area_name text,
  visit_count bigint,
  -- Distance from the NEAREST home location, in metres. The client uses
  -- this to decide whether two reviews are already enough to ask (a
  -- genuinely far-away pair reads as a trip immediately) or whether to wait
  -- for a third (a cluster just outside the home radius could be anything).
  distance_from_home_m double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with av as (
    select v.id, v.place_id, p.geog
    from public.visits v
    join public.places p on p.id = v.place_id
    where v.user_id = target_user_id
      and v.visited_on = target_date
  ),
  away as (
    select av.*
    from av
    where exists (select 1 from public.home_locations h where h.user_id = target_user_id)
      and not exists (
        select 1
        from public.home_locations hl
        join public.places hp on hp.id = hl.place_id
        where hl.user_id = target_user_id
          and (
            public.place_has_ancestor(av.place_id, hl.place_id)
            or (
              av.geog is not null and hp.geog is not null
              and ST_DWithin(av.geog, hp.geog, 16093)
            )
          )
      )
  )
  select
    public.majority_area(array_agg(a.place_id)) as area_place_id,
    (select pl.name from public.places pl where pl.id = public.majority_area(array_agg(a.place_id))) as area_name,
    count(*) as visit_count,
    min(
      (select min(ST_Distance(a.geog, hp2.geog))
       from public.home_locations hl2
       join public.places hp2 on hp2.id = hl2.place_id
       where hl2.user_id = target_user_id and hp2.geog is not null)
    ) as distance_from_home_m
  from away a
  where not exists (
    select 1 from public.trip_overrides ov
    where ov.user_id = target_user_id
      and ov.start_date = target_date
      and (ov.trip_prompt_declined or ov.promoted)
  )
  having count(*) >= 2;
$$;

grant execute on function public.get_trip_suggestion(uuid, date) to authenticated;
