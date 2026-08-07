-- security definer, deviating from get_place_aggregate_rating/
-- get_nearby_reviewed_places' invoker template for the same reason
-- get_collection_stats needed it: those two are silently scoped to the
-- caller's own visible visits under invoker rights, which is wrong for a
-- genuinely global "most popular" ranking. Still re-applies
-- can_view_user_content per-visit inside the aggregation so the ranking
-- reflects all visible-to-someone activity without exposing an individual
-- private/unfollowed user's specific review. Restricted to poi/locality so
-- a whole state or country never shows up as a "popular location."
create or replace function public.get_popular_places(result_limit int default 10)
returns table (place_id uuid, name text, lat double precision, lng double precision, avg_rating numeric, review_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.lat, p.lng, avg(v.rating)::numeric, count(v.id)
  from public.places p
  join public.visits v on v.place_id = p.id
  where p.level in ('poi', 'locality')
    and public.can_view_user_content(auth.uid(), v.user_id)
  group by p.id, p.name, p.lat, p.lng
  order by count(v.id) desc, avg(v.rating) desc nulls last
  limit result_limit;
$$;

grant execute on function public.get_popular_places(int) to authenticated;
