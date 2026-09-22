-- Bind the four remaining personal-data RPCs to whoever is calling them.
--
-- Anonymous access was closed in 20260920120000, but an AUTHENTICATED user
-- could still pass somebody else's id: get_harmony(A, B) computed any two
-- people's compatibility, get_trip_suggestion and get_visit_range_for_place
-- returned any user's trips and visit dates. Every call site in the app
-- passes session.user.id (checked: harmony.tsx, user/[id].tsx, trips.ts,
-- (tabs)/index.tsx, review-form.tsx, trip/new.tsx), so binding the parameter
-- to auth.uid() takes nothing from the app and takes the impersonation away
-- from everyone else.
--
-- The bodies below are the originals, pulled with pg_get_functiondef and
-- re-emitted rather than retyped -- two run to several kilobytes of SQL and
-- hand-copying them is how a quiet bug gets in. The only addition is:
--
--     select * from ( <original> ) as _guarded where <param> = auth.uid()
--
-- Safe to wrap this way because none of the four returns a column sharing a
-- name with its guarded parameter, so the predicate resolves to the
-- parameter rather than being shadowed by an output column. Checked per
-- function. The original body's trailing semicolon is dropped -- it is a
-- statement terminator, and a subquery cannot contain one.
--
-- Renaming the originals and delegating to them was the first plan and was
-- dropped: refresh_harmony_for_user calls get_harmony by name, and a rename
-- would have broken it.

CREATE OR REPLACE FUNCTION public.get_harmony(viewer_id uuid, other_id uuid)
 RETURNS TABLE(score integer, shared_places integer, shared_areas integer, shared_destinations integer, shared_local integer, evidence numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from (
with
  allowed as (select public.can_view_user_content(viewer_id, other_id) as ok),
  gm as (
    select coalesce(avg(rating), 5)::numeric as mean
    from public.visits where rating is not null
  ),
  mine as (select place_id, rating from public.visits where user_id = viewer_id),
  theirs as (select place_id, rating from public.visits where user_id = other_id),

  -- Layer 1: exact same place, both rated. Sharpest, rarest.
  co as (
    select
      m.rating as r1, t.rating as r2, p.level,
      -- Two people independently loving the same everyday spot says more
      -- than agreeing about a landmark everyone passes through once.
      (public.is_home_place(viewer_id, m.place_id)
       or public.is_home_place(other_id, m.place_id)) as is_local
    from mine m
    join theirs t on t.place_id = m.place_id
    join public.places p on p.id = m.place_id
    where m.rating is not null and t.rating is not null
  ),
  local_shared as (select count(*) filter (where is_local) as n from co),
  -- Layer 2: same AREA, using each person's effective rating for it.
  -- Restricted to away-areas so living in the same city still does not
  -- count as travelling alike (see v3).
  co_areas as (
    select ar1.rating as r1, ar2.rating as r2, p.level
    from public.user_area_ratings(viewer_id) ar1
    join public.user_area_ratings(other_id) ar2 on ar2.area_id = ar1.area_id
    join public.places p on p.id = ar1.area_id
    where exists (select 1 from public.user_away_areas(viewer_id) aa where aa.area_id = ar1.area_id)
      and exists (select 1 from public.user_away_areas(other_id) ab where ab.area_id = ar1.area_id)
  ),
  scored as (
    select
      1 - (abs(x.r1 - x.r2) / 10.0) as agreement,
      least(1.0, ((abs(x.r1 - gm.mean) + abs(x.r2 - gm.mean)) / 2.0) / 5.0) as extremity,
      case when sign(x.r1 - gm.mean) = sign(x.r2 - gm.mean) then 1.0 else 0.6 end as concordance,
      x.base_weight as level_weight
    from (
      -- Exact-place matches keep the v2 level weights.
      select r1, r2,
        (case level when 'country' then 3.0 when 'continent' then 3.0
                    when 'admin_area_1' then 2.5 when 'locality' then 2.0 else 1.0 end)
        * (case when is_local then 1.5 else 1.0 end) as base_weight
      from co
      union all
      -- Area-level matches are inferred rather than stated, so they carry
      -- roughly half the weight of an equivalent direct rating.
      select r1, r2,
        case level when 'country' then 1.5 when 'continent' then 1.0
                   when 'admin_area_1' then 1.25 else 1.0 end
      from co_areas
    ) x, gm
  ),
  taste as (
    select
      count(*) as n,
      case when coalesce(sum((0.35 + extremity) * concordance * level_weight), 0) = 0
           then null
           else sum(agreement * ((0.35 + extremity) * concordance * level_weight))
                / sum((0.35 + extremity) * concordance * level_weight) end as agreement,
      coalesce(sum(level_weight), 0) as weight_total
    from scored
  ),

  my_away as (select * from public.user_away_places(viewer_id)),
  their_away as (select * from public.user_away_places(other_id)),
  dest as (
    select count(*) as shared
    from (select distinct place_id from my_away) a
    join (select distinct place_id from their_away) b using (place_id)
  ),
  my_areas as (select * from public.user_away_areas(viewer_id)),
  their_areas as (select * from public.user_away_areas(other_id)),
  area_union as (
    select area_id, max(weight) as weight, count(distinct src) as sides
    from (
      select area_id, weight, 'a' as src from my_areas
      union all
      select area_id, weight, 'b' as src from their_areas
    ) x group by area_id
  ),
  region as (
    select
      count(*) filter (where sides = 2) as shared,
      case when coalesce(sum(weight), 0) = 0 then null
           else coalesce(sum(weight) filter (where sides = 2), 0) / sum(weight) end as jaccard,
      coalesce(sum(weight) filter (where sides = 2), 0) as shared_weight
    from area_union
  ),
  style as (
    select case
      when (select count(*) from mine where rating is not null) = 0
        or (select count(*) from theirs where rating is not null) = 0
      then null
      else 1 - abs(
        (select avg(rating) from mine where rating is not null)
        - (select avg(rating) from theirs where rating is not null)
      ) / 10.0 end as closeness
  ),
  blended as (
    select
      (
        coalesce(taste.agreement * 3, 0)
        + coalesce(region.jaccard * 4, 0)
        + coalesce(style.closeness * 1, 0)
      ) / nullif(
        (case when taste.agreement is null then 0 else 3 end)
        + (case when region.jaccard is null then 0 else 4 end)
        + (case when style.closeness is null then 0 else 1 end)
      , 0) as raw,
      (
        coalesce(taste.weight_total, 0) * 3
        + coalesce(region.shared_weight, 0) * 2
        + coalesce(dest.shared, 0) * 5
      )::numeric as evidence,
      coalesce(taste.n, 0) as shared_places,
      coalesce(region.shared, 0) as shared_areas,
      coalesce(dest.shared, 0) as shared_destinations,
      coalesce(local_shared.n, 0) as shared_local
    from taste, region, style, dest, local_shared
  )
  select
    case when (select ok from allowed) is not true or b.raw is null then null
         else round(
           ((b.evidence / (b.evidence + 5)) * (b.raw * 100)
            + (5 / (b.evidence + 5)) * 50)
         )::int end,
    b.shared_places::int,
    b.shared_areas::int,
    b.shared_destinations::int,
    b.shared_local::int,
    b.evidence
  from blended b
  ) as _guarded
  where viewer_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.get_harmony_breakdown(viewer_id uuid, other_id uuid, max_rows integer DEFAULT 6)
 RETURNS TABLE(kind text, place_id uuid, name text, my_rating numeric, their_rating numeric, agreement numeric, is_local boolean, photo_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from (
with
  allowed as (select public.can_view_user_content(viewer_id, other_id) as ok),
  mine as (select place_id, rating from public.visits where user_id = viewer_id and rating is not null),
  theirs as (select place_id, rating from public.visits where user_id = other_id and rating is not null),
  exact as (
    select
      'place'::text as kind,
      p.id as place_id,
      p.name,
      m.rating as my_rating,
      t.rating as their_rating,
      1 - (abs(m.rating - t.rating) / 10.0) as agreement,
      (public.is_home_place(viewer_id, p.id) or public.is_home_place(other_id, p.id)) as is_local
    from mine m
    join theirs t on t.place_id = m.place_id
    join public.places p on p.id = m.place_id
  ),
  areas as (
    select
      'area'::text as kind,
      p.id as place_id,
      p.name,
      round(ar1.rating, 1) as my_rating,
      round(ar2.rating, 1) as their_rating,
      1 - (abs(ar1.rating - ar2.rating) / 10.0) as agreement,
      false as is_local
    from public.user_area_ratings(viewer_id) ar1
    join public.user_area_ratings(other_id) ar2 on ar2.area_id = ar1.area_id
    join public.places p on p.id = ar1.area_id
    where exists (select 1 from public.user_away_areas(viewer_id) aa where aa.area_id = ar1.area_id)
      and exists (select 1 from public.user_away_areas(other_id) ab where ab.area_id = ar1.area_id)
      and not exists (select 1 from exact e where e.place_id = ar1.area_id)
  ),
  combined as (
    select * from exact
    union all
    select * from areas
  )
  select
    c.kind, c.place_id, c.name, c.my_rating, c.their_rating, c.agreement, c.is_local,
    (
      select ph.id
      from public.photos ph
      join public.visits v on v.id = ph.visit_id
      where public.place_has_ancestor(v.place_id, c.place_id)
        and v.user_id in (viewer_id, other_id)
        and public.can_view_user_content(viewer_id, v.user_id)
      -- Viewer's own first, then most recent.
      order by (v.user_id = viewer_id) desc, v.visited_on desc, ph.position
      limit 1
    ) as photo_id
  from combined c
  where (select ok from allowed) is true
  order by c.agreement desc, c.kind, c.name
  limit max_rows
  ) as _guarded
  where viewer_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.get_trip_suggestion(target_user_id uuid, target_date date)
 RETURNS TABLE(area_place_id uuid, area_name text, visit_count bigint, distance_from_home_m double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select * from (
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
  having count(*) >= 2
  ) as _guarded
  where target_user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.get_visit_range_for_place(target_user_id uuid, target_place_id uuid)
 RETURNS TABLE(start_date date, end_date date, visit_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from (
select min(v.visited_on), max(v.visited_on), count(*)
  from public.visits v
  where v.user_id = target_user_id
    -- Picking a city matches every venue reviewed inside it, not just a
    -- review of the city itself.
    and public.place_has_ancestor(v.place_id, target_place_id)
    and not exists (
      select 1 from public.trip_excluded_visits e
      where e.user_id = v.user_id and e.visit_id = v.id
    )
  having count(*) > 0
  ) as _guarded
  where target_user_id = auth.uid()
$function$;

-- Restated so this file is also correct on a fresh database, where these
-- functions have never been revoked.
revoke all on function public.get_harmony(uuid, uuid) from public, anon;
grant execute on function public.get_harmony(uuid, uuid) to authenticated;
revoke all on function public.get_harmony_breakdown(uuid, uuid, integer) from public, anon;
grant execute on function public.get_harmony_breakdown(uuid, uuid, integer) to authenticated;
revoke all on function public.get_trip_suggestion(uuid, date) from public, anon;
grant execute on function public.get_trip_suggestion(uuid, date) to authenticated;
revoke all on function public.get_visit_range_for_place(uuid, uuid) from public, anon;
grant execute on function public.get_visit_range_for_place(uuid, uuid) to authenticated;
