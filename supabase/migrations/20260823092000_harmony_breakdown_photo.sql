-- Adds a representative photo to each breakdown row.
--
-- Prefers the VIEWER's own photo from that place over the other person's:
-- "your shot of Seattle" is more recognisable to the person reading the
-- screen than a stranger's, and recognising the place at a glance is the
-- whole point of putting a picture there.
drop function if exists public.get_harmony_breakdown(uuid, uuid, int);

create function public.get_harmony_breakdown(
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
  is_local boolean,
  photo_id uuid
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
  limit max_rows;
$fn$;

grant execute on function public.get_harmony_breakdown(uuid, uuid, int) to authenticated;
