-- The span of one user's reviews in or under a given place — what a
-- manually created trip derives its dates from instead of asking.
--
-- Exists as an RPC because the containment test is a recursive walk up the
-- place hierarchy: doing it client-side means one round trip PER REVIEW to
-- ask "is this one inside that place?", which is an N+1 by construction.
-- One query does the whole thing.
create or replace function public.get_visit_range_for_place(
  target_user_id uuid,
  target_place_id uuid
)
returns table (start_date date, end_date date, visit_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select min(v.visited_on), max(v.visited_on), count(*)
  from public.visits v
  where v.user_id = target_user_id
    -- Picking a city matches every venue reviewed inside it, not just a
    -- review of the city itself.
    and public.place_has_ancestor(v.place_id, target_place_id)
    and not exists (
      select 1 from public.trip_excluded_visits e
      where e.user_id = v.user_id and e.visit_id = v.id
    )
  having count(*) > 0;
$$;

grant execute on function public.get_visit_range_for_place(uuid, uuid) to authenticated;
