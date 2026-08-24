-- An effective rating for a broad place (town / state / country), even when
-- the person never rated that place directly.
--
-- Two problems this solves at once:
--
-- 1. FILLER. Someone who reviewed six spots in Lisbon but never rated
--    "Lisbon" itself clearly has an opinion about Lisbon. Rolling their
--    reviews up gives that opinion a number.
--
-- 2. STALENESS. A concrete rating is a real stated opinion and should
--    always carry weight, but one from four years ago should yield ground
--    to what the person has actually reviewed there since. So the
--    aggregate always has SOME influence, and progressively more as the
--    explicit rating ages.
--
-- Why this matters beyond display: harmony could previously only compare
-- two people on the exact same place, and measured against real data only
-- two user pairs in the entire database share one. Comparing at area level
-- means two people who both went to Seattle are comparable even if they
-- picked completely different restaurants.

-- How fast a concrete rating loses ground to the aggregate. At one
-- half-life the decay term is 0.5, at two it is 0.25, and so on.
create or replace function public.rating_recency_weight(rated_on date)
returns numeric
language sql immutable
as $fn$
  select power(0.5, greatest(0, (current_date - rated_on)) / 730.0)::numeric;
$fn$;

create or replace function public.user_area_ratings(uid uuid)
returns table (area_id uuid, rating numeric, has_explicit boolean, sample_size int)
language sql stable security definer set search_path = public
as $fn$
  with recursive chain as (
    -- Every visit paired with itself, then walked up to each ancestor.
    select v.id as visit_id, v.place_id as anc, v.rating, v.visited_on
    from public.visits v
    where v.user_id = uid and v.rating is not null
    union all
    select c.visit_id, p.parent_id, c.rating, c.visited_on
    from chain c
    join public.places p on p.id = c.anc
    where p.parent_id is not null
  ),
  areas as (
    select c.*
    from chain c
    join public.places pa on pa.id = c.anc
    where pa.level in ('locality','admin_area_1','country','continent')
  ),
  -- The person's own rating OF that area, if they reviewed it directly.
  explicit as (
    select v.place_id as area_id, v.rating, max(v.visited_on) as rated_on
    from public.visits v
    where v.user_id = uid and v.rating is not null
    group by v.place_id, v.rating
  ),
  -- Everything they rated UNDERNEATH it. Excludes the direct rating so the
  -- two signals stay separable rather than double-counting.
  rolled as (
    select a.anc as area_id, avg(a.rating) as avg_rating, count(*) as n
    from areas a
    join public.visits v on v.id = a.visit_id
    where v.place_id <> a.anc
    group by a.anc
  )
  select
    coalesce(r.area_id, e.area_id) as area_id,
    case
      when e.rating is null then r.avg_rating
      when r.avg_rating is null then e.rating
      else
        -- Explicit keeps at least half the say even when ancient; a fresh
        -- one keeps ~0.9. The aggregate takes the rest.
        (
          e.rating * (0.5 + 0.4 * public.rating_recency_weight(e.rated_on))
          + r.avg_rating * (1 - (0.5 + 0.4 * public.rating_recency_weight(e.rated_on)))
        )
    end as rating,
    (e.rating is not null) as has_explicit,
    coalesce(r.n, 0)::int + (case when e.rating is null then 0 else 1 end) as sample_size
  from rolled r
  full outer join explicit e on e.area_id = r.area_id
  where coalesce(r.avg_rating, e.rating) is not null;
$fn$;

grant execute on function public.rating_recency_weight(date) to authenticated;
grant execute on function public.user_area_ratings(uuid) to authenticated;
