-- Reviewed places inside a map's view, for Map search: one row per place,
-- with what its pin needs (where it is, its average, how many reviews) and
-- what the filters sort and narrow by (rating, popularity, tags).
--
-- security definer for the same reason as get_discover_places and
-- get_popular_places: a place's average is taken over every review the
-- caller may see, which an invoker-rights function cannot reach past
-- visits' own row security. can_view_user_content is applied per review
-- inside, so nothing a viewer could not otherwise see is counted.
--
-- Spots, trails and towns only: a whole state or country has no one point
-- to put a pin on, and its review count would swamp every place inside it.
create or replace function public.get_map_places(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  -- Places averaging at least this. Null for any rating, unrated included.
  min_rating numeric default null,
  -- Places with at least this many visible reviews.
  min_reviews int default 1,
  -- Places with a visible review carrying every one of these tags. Empty or
  -- null for no tag filter.
  tag_slugs text[] default null,
  -- 'popular' (most reviews first) or 'rating' (best average first).
  sort_by text default 'popular',
  result_limit int default 150
)
returns table (
  place_id uuid,
  name text,
  lat double precision,
  lng double precision,
  level text,
  avg_rating numeric,
  review_count bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with bounds as (
    -- The view as a box. A view crossing the antimeridian (min_lng above
    -- max_lng) is two boxes, either side of it.
    select ST_MakeEnvelope(min_lng, min_lat, case when min_lng <= max_lng then max_lng else 180 end, max_lat, 4326) as box
    union all
    select ST_MakeEnvelope(-180, min_lat, max_lng, max_lat, 4326)
    where min_lng > max_lng
  ),
  in_view as (
    select p.id, p.name, p.lat, p.lng, p.level
    from public.places p
    where p.level in ('poi', 'trail', 'locality')
      and p.lat is not null and p.lng is not null
      and exists (select 1 from bounds b where p.geog && b.box::geography)
  ),
  visible as (
    select v.id, v.place_id, v.rating
    from public.visits v
    join in_view iv on iv.id = v.place_id
    where public.can_view_user_content(auth.uid(), v.user_id)
  ),
  tagged as (
    -- Places with one visible review carrying all the asked-for tags.
    select distinct vis.place_id
    from visible vis
    where tag_slugs is null
      or cardinality(tag_slugs) = 0
      or (
        select count(distinct vt.tag_slug)
        from public.visit_tags vt
        where vt.visit_id = vis.id and vt.tag_slug = any (tag_slugs)
      ) = cardinality(tag_slugs)
  )
  select
    iv.id,
    iv.name,
    iv.lat,
    iv.lng,
    iv.level,
    round(avg(vis.rating)::numeric, 1),
    count(vis.id)
  from in_view iv
  join visible vis on vis.place_id = iv.id
  where iv.id in (select place_id from tagged)
  group by iv.id, iv.name, iv.lat, iv.lng, iv.level
  having count(vis.id) >= greatest(1, coalesce(min_reviews, 1))
    and (min_rating is null or avg(vis.rating) >= min_rating)
  order by
    case when sort_by = 'rating' then avg(vis.rating) end desc nulls last,
    count(vis.id) desc,
    avg(vis.rating) desc nulls last
  limit least(greatest(coalesce(result_limit, 150), 1), 300);
$$;

-- Signed-in callers only. A new function is executable by everyone, anon
-- included, until revoked; as security definer it runs past row security,
-- and for an anonymous caller can_view_user_content resolves to every
-- public account (see 20260930150000_p1_hardening.sql, section 4).
revoke execute on function public.get_map_places(
  double precision, double precision, double precision, double precision,
  numeric, int, text[], text, int
) from public, anon;
grant execute on function public.get_map_places(
  double precision, double precision, double precision, double precision,
  numeric, int, text[], text, int
) to authenticated;
