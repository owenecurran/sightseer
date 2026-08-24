-- The "why" behind a harmony score.
--
-- A single number invites distrust: 82 out of what, decided how? This
-- returns the specific places behind it, so the meter can show its working
-- instead of asking to be believed.
--
-- Deliberately mirrors get_harmony's own two taste layers rather than
-- recomputing anything differently: exact places both people rated, and
-- areas compared through effective ratings. If these two ever disagree,
-- one of them is wrong -- so they share the same definitions
-- (user_area_ratings, user_away_areas, is_home_place).
create or replace function public.get_harmony_breakdown(
  viewer_id uuid,
  other_id uuid,
  max_rows int default 6
)
returns table (
  kind text,
  place_id uuid,
  name text,
  my_rating numeric,
  their_rating numeric,
  agreement numeric,
  is_local boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
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
  -- Areas both travelled to, scored on each person's effective rating.
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
      -- An exact match already says it better, so don't list it twice.
      and not exists (select 1 from exact e where e.place_id = ar1.area_id)
  )
  select * from (
    select * from exact
    union all
    select * from areas
  ) combined
  where (select ok from allowed) is true
  -- Closest agreement first: the point is "here's where you two line up".
  order by agreement desc, kind, name
  limit max_rows;
$fn$;

grant execute on function public.get_harmony_breakdown(uuid, uuid, int) to authenticated;
