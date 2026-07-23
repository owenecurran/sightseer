-- Trigram indexes for fast profile search, matching the pattern already
-- used for places.name.
create index users_handle_trgm_idx on public.users using gist (handle gist_trgm_ops);
create index users_name_trgm_idx on public.users using gist (name gist_trgm_ops);

-- Rolls a place's rating up through all descendants (a review of Denver
-- counts toward Colorado's aggregate) — the recursive-CTE approach decided
-- on when the places hierarchy was designed. Deliberately not SECURITY
-- DEFINER: runs as the calling role, so the visits it averages are exactly
-- the ones RLS already lets that caller see — same visibility rule as
-- everywhere else in the app, not a special case.
create or replace function public.get_place_aggregate_rating(target_place_id uuid)
returns table(avg_rating numeric, review_count bigint)
language sql
stable
as $$
  with recursive descendants as (
    select id from public.places where id = target_place_id
    union all
    select p.id from public.places p
    join descendants d on p.parent_id = d.id
  )
  select avg(v.rating)::numeric, count(v.id)
  from public.visits v
  where v.place_id in (select id from descendants);
$$;
