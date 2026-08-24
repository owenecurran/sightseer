-- Harmony v3: the DECISION to go somewhere is itself the signal.
--
-- v2 counted every area a person had visited, home included, so two people
-- who merely live in the same city scored overlap for it. That is shared
-- residence, not shared travel taste, and it quietly inflated harmony
-- between neighbours who may travel nothing alike.
--
-- v3 measures overlap only over places AWAY from each person own home
-- locations, reusing the predicate trip detection already uses (inside a
-- home place hierarchy, or within ~10 miles of one). Choosing to travel
-- somewhere is the strongest available statement about how someone
-- vacations, and two people independently choosing the same destination
-- says more than either rating it the same afterwards.
--
-- The weighting runs OPPOSITE to the rating weights, deliberately:
--   * For RATINGS, broader is worth more: rating a whole country is a
--     summary judgement over a lot of experience (see v2).
--   * For DESTINATIONS, narrower is worth more: both choosing Lisbon says
--     far more than both having set foot in Europe.
-- Different axes, so it is coherent for them to disagree.

-- Places a user visited that are NOT home. A user with no home locations
-- has nothing to subtract, so everything counts: the best available answer
-- rather than dropping them out of harmony entirely.
create or replace function public.user_away_places(uid uuid)
returns table (place_id uuid, rating numeric)
language sql stable security definer set search_path = public
as $fn$
  select v.place_id, v.rating
  from public.visits v
  join public.places p on p.id = v.place_id
  where v.user_id = uid
    and not exists (
      select 1
      from public.home_locations hl
      join public.places hp on hp.id = hl.place_id
      where hl.user_id = uid
        and (
          public.place_has_ancestor(v.place_id, hl.place_id)
          or (p.geog is not null and hp.geog is not null and ST_DWithin(p.geog, hp.geog, 16093))
        )
    );
$fn$;

-- Every area those away-places sit inside, weighted by how specific it is.
-- A shared city is effectively the same trip; a shared continent is noise.
create or replace function public.user_away_areas(uid uuid)
returns table (area_id uuid, weight numeric)
language sql stable security definer set search_path = public
as $fn$
  with recursive chain as (
    select place_id as leaf, place_id as anc from public.user_away_places(uid)
    union all
    select c.leaf, p.parent_id
    from chain c join public.places p on p.id = c.anc
    where p.parent_id is not null
  )
  select distinct chain.anc,
    case pa.level
      when 'locality' then 3.0
      when 'admin_area_1' then 2.0
      when 'country' then 1.0
      else 0.5
    end
  from chain
  join public.places pa on pa.id = chain.anc
  where pa.level in ('locality','admin_area_1','country','continent');
$fn$;

grant execute on function public.user_away_places(uuid) to authenticated;
grant execute on function public.user_away_areas(uuid) to authenticated;

-- Adds a column, so the old signature has to go first: Postgres will not
-- let create-or-replace change a return type.
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
      least(1.0, ((abs(c.r1 - gm.mean) + abs(c.r2 - gm.mean)) / 2.0) / 5.0) as extremity,
      case when sign(c.r1 - gm.mean) = sign(c.r2 - gm.mean) then 1.0 else 0.6 end as concordance,
      case c.level
        when 'country' then 3.0 when 'continent' then 3.0
        when 'admin_area_1' then 2.5 when 'locality' then 2.0 else 1.0
      end as level_weight
    from co c, gm
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
