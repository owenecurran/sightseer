-- Harmony: how similar two travellers are.
--
-- Designed around a hard constraint measured in the real data rather than
-- assumed: across the whole database, only TWO user pairs share even one
-- co-rated place, and the maximum shared is 1. A textbook
-- collaborative-filtering score (Pearson over co-rated items) would
-- therefore return nothing for almost every pair, and where it did fire it
-- would be computed from a single data point -- pure noise presented as a
-- percentage.
--
-- So harmony blends three signals of decreasing rarity and increasing
-- availability, and is then SHRUNK toward neutral by how much evidence
-- actually exists:
--
--   1. Taste agreement  -- ratings on places both have reviewed. The gold
--      standard, and currently the rarest.
--   2. Region overlap   -- Jaccard over the areas each has visited
--      (locality / state / country / continent). Fires far more often.
--   3. Rating style     -- how generously each person rates overall. Needs
--      NO overlap at all, so it always contributes something.
--
-- Shrinkage is the important part: without it one shared 10/10 reads as
-- "100% harmony", which is meaningless. With it, thin evidence lands near
-- 50 and only real overlap moves the needle.
create or replace function public.get_harmony(viewer_id uuid, other_id uuid)
returns table (
  score int,
  shared_places int,
  shared_areas int,
  -- Raw evidence weight behind the score, so the UI can say "based on very
  -- little" instead of implying false precision.
  evidence numeric
)
language sql
stable
security definer
set search_path = public
as $fn$
  with
  -- Privacy gate: no score at all for someone whose content the viewer
  -- can't see, so this can't be used to probe private accounts.
  allowed as (
    select public.can_view_user_content(viewer_id, other_id) as ok
  ),
  mine as (
    select place_id, rating from public.visits where user_id = viewer_id
  ),
  theirs as (
    select place_id, rating from public.visits where user_id = other_id
  ),
  -- 1. Taste agreement on co-rated places.
  co as (
    select m.rating as r1, t.rating as r2
    from mine m join theirs t on t.place_id = m.place_id
    where m.rating is not null and t.rating is not null
  ),
  taste as (
    select
      count(*) as n,
      -- Ratings are 0-10, so the worst possible gap is 10.
      case when count(*) = 0 then null
           else 1 - (avg(abs(r1 - r2)) / 10.0) end as agreement
    from co
  ),
  -- 2. Region overlap. Each user's footprint is every area ancestor of
  -- every place they've visited.
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
      count(*) as total,
      case when count(*) = 0 then null
           else count(*) filter (where who_count = 2)::numeric / count(*) end as jaccard
    from (select area_id, count(distinct who) as who_count from areas group by area_id) x
  ),
  -- 3. Rating style: similar generosity even with nothing in common.
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
      -- Weighted by how trustworthy each signal is, skipping any that has
      -- no data rather than treating a null as zero.
      (
        coalesce(taste.agreement * 3, 0)
        + coalesce(region.jaccard * 2, 0)
        + coalesce(style.closeness * 1, 0)
      ) / nullif(
        (case when taste.agreement is null then 0 else 3 end)
        + (case when region.jaccard is null then 0 else 2 end)
        + (case when style.closeness is null then 0 else 1 end)
      , 0) as raw,
      -- A co-rated place is worth far more than a shared country.
      (taste.n * 3 + coalesce(region.shared, 0))::numeric as evidence,
      taste.n as shared_places,
      coalesce(region.shared, 0) as shared_areas
    from taste, region, style
  )
  select
    case when (select ok from allowed) is not true or b.raw is null then null
         else round(
           -- Shrink toward 50 until there's real evidence. k = 5 means a
           -- single shared area barely moves it, while several co-rated
           -- places pull it most of the way to the raw score.
           ((b.evidence / (b.evidence + 5)) * (b.raw * 100)
            + (5 / (b.evidence + 5)) * 50)
         )::int end as score,
    b.shared_places::int,
    b.shared_areas::int,
    b.evidence
  from blended b;
$fn$;

grant execute on function public.get_harmony(uuid, uuid) to authenticated;
