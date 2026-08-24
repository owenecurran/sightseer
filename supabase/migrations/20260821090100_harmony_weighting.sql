-- Harmony v2: weights co-rated places by how much they actually tell us.
--
-- Two refinements over the flat average in v1, both aimed at the same
-- thing -- not all agreement is equally informative.
--
-- 1. EXTREMES COUNT FOR MORE. Measured on real data, the mean rating is
--    ~7.1 with an SD of ~2.1: almost everyone rates almost everything
--    around 7. So two people both saying "7" is close to no information --
--    it is what the average person says about the average place. Two
--    people both saying 10, or both saying 2, is a genuine shared opinion.
--    Each co-rated place is therefore weighted by how far BOTH ratings sit
--    from the global mean, with a floor so a mid rating still counts a
--    little rather than nothing.
--
--    A concordance factor goes with it: deviating in the SAME direction
--    (both above the mean, or both below) is the informative case. Both
--    extreme but opposite is strong disagreement, so it keeps its weight
--    but scores near zero agreement on its own merits.
--
-- 2. BROADER PLACES COUNT FOR MORE. Rating a whole town or country is a
--    summary judgement covering a lot of experience, so it says more about
--    someone as a traveller than one cafe does.
--
--    Worth noting the tension deliberately: in classic recommender
--    systems the opposite is often argued -- agreement on a SPECIFIC item
--    is rarer and more discriminating than agreement on a broad one. Both
--    readings are defensible; these weights encode the travel-taste
--    reading, and they are the dial to turn if it reads wrong in practice.
create or replace function public.get_harmony(viewer_id uuid, other_id uuid)
returns table (
  score int,
  shared_places int,
  shared_areas int,
  evidence numeric
)
language sql
stable
security definer
set search_path = public
as $fn$
  with
  allowed as (
    select public.can_view_user_content(viewer_id, other_id) as ok
  ),
  -- The norm every rating is judged against. Computed live rather than
  -- hardcoded so it tracks the app's real rating culture as it shifts.
  gm as (
    select coalesce(avg(rating), 5)::numeric as mean
    from public.visits where rating is not null
  ),
  mine as (
    select place_id, rating from public.visits where user_id = viewer_id
  ),
  theirs as (
    select place_id, rating from public.visits where user_id = other_id
  ),
  co as (
    select m.rating as r1, t.rating as r2, p.level
    from mine m
    join theirs t on t.place_id = m.place_id
    join public.places p on p.id = m.place_id
    where m.rating is not null and t.rating is not null
  ),
  scored as (
    select
      1 - (abs(c.r1 - c.r2) / 10.0) as agreement,
      -- 0 at the mean, 1 at either end of the scale.
      least(1.0, ((abs(c.r1 - gm.mean) + abs(c.r2 - gm.mean)) / 2.0) / 5.0) as extremity,
      case
        when sign(c.r1 - gm.mean) = sign(c.r2 - gm.mean) then 1.0
        else 0.6
      end as concordance,
      case c.level
        when 'country' then 3.0
        when 'continent' then 3.0
        when 'admin_area_1' then 2.5
        when 'locality' then 2.0
        else 1.0
      end as level_weight
    from co c, gm
  ),
  weighted as (
    select
      -- The 0.35 floor keeps a mid-rating agreement from counting as
      -- literally nothing; extremity adds on top of it.
      sum(agreement * ((0.35 + extremity) * concordance * level_weight)) as num,
      sum((0.35 + extremity) * concordance * level_weight) as den,
      count(*) as n,
      -- Evidence tracks the same weighting: co-rating a country is worth
      -- more than co-rating a coffee shop.
      coalesce(sum(level_weight), 0) as weight_total
    from scored
  ),
  taste as (
    select
      w.n,
      case when w.den is null or w.den = 0 then null else w.num / w.den end as agreement,
      w.weight_total
    from weighted w
  ),
  areas as (
    select 'mine' as who, a.anc as area_id from (
      with recursive chain as (
        select place_id as leaf, place_id as anc from mine
        union all
        select c.leaf, p.parent_id from chain c
        join public.places p on p.id = c.anc where p.parent_id is not null
      )
      select distinct chain.anc from chain
      join public.places pa on pa.id = chain.anc
      where pa.level in ('locality','admin_area_1','country','continent')
    ) a
    union all
    select 'theirs', a.anc from (
      with recursive chain as (
        select place_id as leaf, place_id as anc from theirs
        union all
        select c.leaf, p.parent_id from chain c
        join public.places p on p.id = c.anc where p.parent_id is not null
      )
      select distinct chain.anc from chain
      join public.places pa on pa.id = chain.anc
      where pa.level in ('locality','admin_area_1','country','continent')
    ) a
  ),
  region as (
    select
      count(*) filter (where who_count = 2) as shared,
      case when count(*) = 0 then null
           else count(*) filter (where who_count = 2)::numeric / count(*) end as jaccard
    from (select area_id, count(distinct who) as who_count from areas group by area_id) x
  ),
  style as (
    select
      case
        when (select count(*) from mine where rating is not null) = 0
          or (select count(*) from theirs where rating is not null) = 0
        then null
        else 1 - abs(
          (select avg(rating) from mine where rating is not null)
          - (select avg(rating) from theirs where rating is not null)
        ) / 10.0
      end as closeness
  ),
  blended as (
    select
      (
        coalesce(taste.agreement * 3, 0)
        + coalesce(region.jaccard * 2, 0)
        + coalesce(style.closeness * 1, 0)
      ) / nullif(
        (case when taste.agreement is null then 0 else 3 end)
        + (case when region.jaccard is null then 0 else 2 end)
        + (case when style.closeness is null then 0 else 1 end)
      , 0) as raw,
      (coalesce(taste.weight_total, 0) * 3 + coalesce(region.shared, 0))::numeric as evidence,
      coalesce(taste.n, 0) as shared_places,
      coalesce(region.shared, 0) as shared_areas
    from taste, region, style
  )
  select
    case when (select ok from allowed) is not true or b.raw is null then null
         else round(
           ((b.evidence / (b.evidence + 5)) * (b.raw * 100)
            + (5 / (b.evidence + 5)) * 50)
         )::int end as score,
    b.shared_places::int,
    b.shared_areas::int,
    b.evidence
  from blended b;
$fn$;

grant execute on function public.get_harmony(uuid, uuid) to authenticated;
