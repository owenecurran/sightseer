-- Close the RPC surface that bypasses RLS.
--
-- Found while auditing before open beta, and demonstrated rather than
-- inferred: with nothing but the public anon key and no login at all, a POST
-- to /rest/v1/rpc/user_away_places with somebody else's user id returned
-- their reviewed places and ratings. user_away_areas, user_area_ratings and
-- get_top_matches did the same. Private accounts, blocking and
-- can_view_user_content are all bypassed through this door.
--
-- The cause is Postgres's default, not a mistake anyone made in these
-- function bodies: CREATE FUNCTION grants EXECUTE TO PUBLIC unless you say
-- otherwise, and `security definer` then runs them as the owner. Every
-- function in this schema that nobody explicitly revoked is therefore
-- callable by anon, RLS and all.
--
-- Two tiers below. The first is the one that matters most — nothing here
-- should ever be reachable without logging in.

-- Tier 1: never called by the client at all.
--
-- Checked by grepping src/ for each name: zero call sites. These are internal
-- machinery for the harmony system — the aggregates it builds a match out of,
-- and the queue that refreshes them. Nothing outside the database has any
-- business calling them, so they are revoked from everyone. The triggers and
-- functions that use them run as the definer and are unaffected by grants.
revoke all on function public.user_away_places(uuid) from public, anon, authenticated;
revoke all on function public.user_away_areas(uuid) from public, anon, authenticated;
revoke all on function public.user_area_ratings(uuid) from public, anon, authenticated;
revoke all on function public.get_top_matches(uuid, integer) from public, anon, authenticated;
revoke all on function public.refresh_harmony_for_user(uuid) from public, anon, authenticated;
revoke all on function public.drain_harmony_refresh_queue(integer) from public, anon, authenticated;

-- Tier 2: the client does call these, but never before signing in.
--
-- Anonymous access buys nothing and costs the whole privacy model. Revoked
-- from PUBLIC and anon, then granted back to authenticated so the app keeps
-- working. Each is listed with what it exposes, so the next person deciding
-- whether to widen a grant can see the cost.

-- Another user's trips, visit dates and compatibility.
revoke all on function public.get_trip_suggestion(uuid, date) from public, anon;
grant execute on function public.get_trip_suggestion(uuid, date) to authenticated;

revoke all on function public.get_visit_range_for_place(uuid, uuid) from public, anon;
grant execute on function public.get_visit_range_for_place(uuid, uuid) to authenticated;

revoke all on function public.get_harmony(uuid, uuid) from public, anon;
grant execute on function public.get_harmony(uuid, uuid) to authenticated;

revoke all on function public.get_harmony_breakdown(uuid, uuid, integer) from public, anon;
grant execute on function public.get_harmony_breakdown(uuid, uuid, integer) to authenticated;

-- Writes to shared place data. An anonymous caller rewriting the geometry or
-- the category of a place every user sees is not a thing this app ever needs.
revoke all on function public.store_place_boundary(uuid, jsonb) from public, anon;
grant execute on function public.store_place_boundary(uuid, jsonb) to authenticated;

revoke all on function public.upgrade_place_details(uuid, text, text, double precision, double precision)
  from public, anon;
grant execute on function public.upgrade_place_details(uuid, text, text, double precision, double precision)
  to authenticated;

-- Deliberately NOT revoked from anon: resolve_invite and record_invite_click.
-- An invite link is opened by someone who has no account yet, which is the
-- entire point of it, so those two have to answer before sign-in.
