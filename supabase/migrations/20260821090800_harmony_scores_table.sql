-- Precomputed harmony, so Discovery can rank people without scoring them
-- live.
--
-- Measured cost of the live function: 219ms for one pair, ~12.6ms per pair
-- amortised across a sweep. Ranking one user against a thousand others is
-- therefore ~12 seconds of database work, on every page load, for every
-- viewer -- and it is O(n^2) across the graph. Reading a precomputed row is
-- an index scan.
--
-- Pairs are stored ONCE under a canonical ordering (user_a < user_b) rather
-- than twice: harmony is symmetric, so storing both directions doubles the
-- write cost and creates two rows that can disagree.
create table public.harmony_scores (
  user_a uuid not null references public.users (id) on delete cascade,
  user_b uuid not null references public.users (id) on delete cascade,
  score int not null,
  shared_places int not null default 0,
  shared_areas int not null default 0,
  shared_destinations int not null default 0,
  shared_local int not null default 0,
  evidence numeric not null default 0,
  computed_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint harmony_scores_ordered check (user_a < user_b)
);

-- Ranking is always "best matches for ONE person", and that person may be
-- on either side of the pair, so both directions need an index.
create index harmony_scores_a_idx on public.harmony_scores (user_a, score desc);
create index harmony_scores_b_idx on public.harmony_scores (user_b, score desc);

alter table public.harmony_scores enable row level security;

-- Only the two people in a pair can read their own score. Visibility is
-- re-checked live at read time too (see get_top_matches) because a user can
-- go private after a score was computed.
create policy "harmony_scores_select_participant" on public.harmony_scores
  for select using (auth.uid() = user_a or auth.uid() = user_b);

-- Recomputes one user's scores against everyone plausibly comparable.
--
-- Candidate generation matters as much as the scoring: comparing against
-- every user is the O(n^2) trap. Only people who have visited somewhere
-- inside one of this user's away-areas can score above the neutral prior on
-- the destination signal, so everyone else is skipped entirely.
create or replace function public.refresh_harmony_for_user(uid uuid)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  touched int;
begin
  with my_areas as (
    select area_id from public.user_away_areas(uid)
  ),
  candidates as (
    select distinct v.user_id
    from public.visits v
    where v.user_id <> uid
      and exists (
        select 1 from my_areas ma
        where public.place_has_ancestor(v.place_id, ma.area_id)
      )
  ),
  scored as (
    select
      least(uid, c.user_id) as user_a,
      greatest(uid, c.user_id) as user_b,
      h.*
    from candidates c
    cross join lateral public.get_harmony(uid, c.user_id) h
    where h.score is not null
  )
  insert into public.harmony_scores as hs
    (user_a, user_b, score, shared_places, shared_areas, shared_destinations, shared_local, evidence, computed_at)
  select user_a, user_b, score, shared_places, shared_areas, shared_destinations, shared_local, evidence, now()
  from scored
  on conflict (user_a, user_b) do update set
    score = excluded.score,
    shared_places = excluded.shared_places,
    shared_areas = excluded.shared_areas,
    shared_destinations = excluded.shared_destinations,
    shared_local = excluded.shared_local,
    evidence = excluded.evidence,
    computed_at = now();

  get diagnostics touched = row_count;
  return touched;
end;
$fn$;

-- Best matches for one person, read straight off the precomputed table.
-- Privacy is re-applied here rather than trusted from compute time: someone
-- may have gone private, blocked the viewer, or been unfollowed since.
create or replace function public.get_top_matches(uid uuid, result_limit int default 10)
returns table (
  user_id uuid,
  name text,
  handle text,
  avatar_r2_key text,
  score int,
  shared_destinations int,
  evidence numeric
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    u.id, u.name, u.handle, u.avatar_r2_key,
    hs.score, hs.shared_destinations, hs.evidence
  from public.harmony_scores hs
  join public.users u
    on u.id = case when hs.user_a = uid then hs.user_b else hs.user_a end
  where (hs.user_a = uid or hs.user_b = uid)
    and public.can_view_user_content(uid, u.id)
  order by hs.score desc, hs.evidence desc
  limit result_limit;
$fn$;

grant execute on function public.refresh_harmony_for_user(uuid) to authenticated;
grant execute on function public.get_top_matches(uuid, int) to authenticated;
