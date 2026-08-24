-- Harmony v4: compare taste at AREA level, using effective area ratings.
--
-- The measured problem with v3: taste agreement only fired when two people
-- rated the exact same place, and across the whole database only two user
-- pairs share even one. So the single best signal was almost never
-- available, and harmony leaned on destination overlap alone.
--
-- user_area_ratings gives every person a rating for every town, state and
-- country they have reviewed anything inside (see that migration). Two
-- people who both went to Seattle are now comparable even if one reviewed
-- restaurants and the other reviewed parks.
--
-- Exact-place agreement is still counted, and still weighted highest: it
-- remains the sharpest evidence when it exists. Area agreement is the
-- broad, plentiful layer underneath it.
drop function if exists public.get_harmony(uuid, uuid);

create function public.get_harmony(viewer_id uuid, other_id uuid)
returns table (
  score int,
  shared_places int,
  shared_areas int,
  shared_destinations int,
  evidence numeric
)
language sql
stable
security definer
set search_path = public
as $fn$
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
    select m.rating as r1, t.rating as r2, p.level
    from mine m
    join theirs t on t.place_id = m.place_id
    join public.places p on p.id = m.place_id
    where m.rating is not null and t.rating is not null
  ),
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
        case level when 'country' then 3.0 when 'continent' then 3.0
                   when 'admin_area_1' then 2.5 when 'locality' then 2.0 else 1.0 end as base_weight
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
      coalesce(dest.shared, 0) as shared_destinations
    from taste, region, style, dest
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
    b.evidence
  from blended b;
$fn$;

grant execute on function public.get_harmony(uuid, uuid) to authenticated;
