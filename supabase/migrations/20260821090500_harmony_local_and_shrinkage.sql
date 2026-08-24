-- Two refinements, from the same realisation: "where did you choose to go"
-- and "how do you feel about places" are different questions, and only the
-- first one should exclude home.
--
-- 1. LOCAL FAVOURITES COUNT. v3 stripped home out of everything to stop two
--    people who merely live in the same city looking like similar
--    travellers. But if you both rate the same neighbourhood park 9.5, that
--    is real shared taste. So: home is still excluded from DESTINATION and
--    AREA overlap (choice), and included in exact-place TASTE agreement
--    (opinion). A shared local favourite now also gets a small boost, since
--    two people independently loving the same everyday spot is a stronger
--    statement than agreeing about a landmark everyone visits once.
--
-- 2. THIN AGGREGATES GET SHRUNK. user_area_ratings treated a country
--    inferred from one review the same as a state inferred from seven.
--    Each aggregate is now pulled toward that person's own average rating
--    in proportion to how little backs it -- the same trick harmony itself
--    uses on the final score.

-- Shared by away-place filtering and the local-favourite check, so the
-- definition of "home" lives in exactly one place.
create or replace function public.is_home_place(uid uuid, pid uuid)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1
    from public.home_locations hl
    join public.places hp on hp.id = hl.place_id
    join public.places p on p.id = pid
    where hl.user_id = uid
      and (
        public.place_has_ancestor(pid, hl.place_id)
        or (p.geog is not null and hp.geog is not null and ST_DWithin(p.geog, hp.geog, 16093))
      )
  );
$fn$;

create or replace function public.user_away_places(uid uuid)
returns table (place_id uuid, rating numeric)
language sql stable security definer set search_path = public
as $fn$
  select v.place_id, v.rating
  from public.visits v
  where v.user_id = uid
    and not public.is_home_place(uid, v.place_id);
$fn$;

-- k in the shrinkage below. At n=1 the aggregate keeps a third of its
-- weight, at n=6 three quarters. Low enough that real evidence wins
-- quickly, high enough that a single review of one cafe does not set the
-- tone for an entire country.
create or replace function public.area_rating_shrinkage_k()
returns numeric language sql immutable as $fn$ select 2.0::numeric; $fn$;

create or replace function public.user_area_ratings(uid uuid)
returns table (area_id uuid, rating numeric, has_explicit boolean, sample_size int)
language sql stable security definer set search_path = public
as $fn$
  with recursive chain as (
    select v.id as visit_id, v.place_id as anc, v.rating, v.visited_on
    from public.visits v
    where v.user_id = uid and v.rating is not null
    union all
    select c.visit_id, p.parent_id, c.rating, c.visited_on
    from chain c
    join public.places p on p.id = c.anc
    where p.parent_id is not null
  ),
  -- What this person rates on average, the prior a thin aggregate falls
  -- back toward. Their own mean, not the global one: a harsh rater's
  -- sparse country should regress to harsh, not to everyone else.
  own_mean as (
    select coalesce(avg(rating), 5)::numeric as mean
    from public.visits where user_id = uid and rating is not null
  ),
  areas as (
    select c.*
    from chain c
    join public.places pa on pa.id = c.anc
    where pa.level in ('locality','admin_area_1','country','continent')
  ),
  explicit as (
    select v.place_id as area_id, v.rating, max(v.visited_on) as rated_on
    from public.visits v
    where v.user_id = uid and v.rating is not null
    group by v.place_id, v.rating
  ),
  rolled as (
    select a.anc as area_id, avg(a.rating) as avg_rating, count(*) as n
    from areas a
    join public.visits v on v.id = a.visit_id
    where v.place_id <> a.anc
    group by a.anc
  ),
  shrunk as (
    select
      r.area_id,
      -- Pull toward the person's own mean in proportion to how thin the
      -- evidence is.
      (r.n / (r.n + public.area_rating_shrinkage_k())) * r.avg_rating
        + (public.area_rating_shrinkage_k() / (r.n + public.area_rating_shrinkage_k())) * om.mean
        as avg_rating,
      r.n
    from rolled r, own_mean om
  )
  select
    coalesce(s.area_id, e.area_id),
    case
      when e.rating is null then s.avg_rating
      when s.avg_rating is null then e.rating
      else
        e.rating * (0.5 + 0.4 * public.rating_recency_weight(e.rated_on))
        + s.avg_rating * (1 - (0.5 + 0.4 * public.rating_recency_weight(e.rated_on)))
    end,
    (e.rating is not null),
    coalesce(s.n, 0)::int + (case when e.rating is null then 0 else 1 end)
  from shrunk s
  full outer join explicit e on e.area_id = s.area_id
  where coalesce(s.avg_rating, e.rating) is not null;
$fn$;

grant execute on function public.is_home_place(uuid, uuid) to authenticated;
grant execute on function public.area_rating_shrinkage_k() to authenticated;
