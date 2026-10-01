-- Stop publishing every column of every user row to the internet.
--
-- THE PROBLEM. users_select_all (20260721120100_rls_policies.sql) is
-- `for select using (true)` with no column grants, and it was never altered.
-- RLS is ROW level, so "true" means every row, and without column grants that
-- means every COLUMN of every row — to `anon`, whose key ships inside the
-- client bundle and is therefore public. All 46 columns, including:
--
--     birthdate            date of birth, for the entire user base
--     hashed_phone         peppered, but downloadable in bulk; two accounts
--     hashed_email         sharing a hash are provably the same person
--     ban_reason           moderation notes
--     banned_at
--     is_admin             lets anyone enumerate the administrators
--     invited_by           the full invite graph
--     terms_accepted_at    plus every notify_* preference and signup flag
--
-- This applies to PRIVATE accounts too: is_private gates their content, not
-- their user row, so their name, bio and date of birth were readable anyway.
--
-- THE SHAPE OF THE FIX. Row-level security cannot hide a column, so the split
-- has to be made by GRANT. The table keeps its permissive row policy — the app
-- genuinely does need to show other people's profiles — and the grant narrows
-- that to the columns a profile is actually rendered from.
--
-- An account's own row still needs everything: the signup gates, the notify
-- preferences and hashed_phone are all read from it. A column grant cannot say
-- "these columns, but only for your own row", so own-row access moves to a
-- definer function instead. That is the whole reason get_my_profile exists.

-- ---------------------------------------------------------------------
-- Your own row, in full
-- ---------------------------------------------------------------------
create or replace function public.get_my_profile()
returns public.users
language sql
stable
security definer
set search_path = public
as $$
  select * from public.users where id = auth.uid();
$$;

-- authenticated only. There is no such thing as an anonymous own-row.
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- ---------------------------------------------------------------------
-- The moderation list, for admins
-- ---------------------------------------------------------------------
--
-- banned_at and ban_reason leave the public grant, so the one screen that
-- legitimately reads them needs its own door. Gated on is_admin read INSIDE
-- the function — a client that asks nicely is not an admin.
create or replace function public.admin_list_banned()
returns table (id uuid, name text, handle text, banned_at timestamptz, ban_reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users u where u.id = auth.uid() and u.is_admin = true
  ) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return query
    select u.id, u.name, u.handle, u.banned_at, u.ban_reason
    from public.users u
    where u.banned_at is not null
    order by u.banned_at desc;
end;
$$;

revoke all on function public.admin_list_banned() from public, anon;
grant execute on function public.admin_list_banned() to authenticated;

-- ---------------------------------------------------------------------
-- The narrowing itself
-- ---------------------------------------------------------------------
--
-- Table-level SELECT covers every column and cannot be subtracted from, so it
-- is revoked outright and re-granted per column. Everything NOT listed here is
-- now reachable only through a definer function that decides who may see it.
--
-- The list is what a profile is drawn from, nothing more: identity, the bits
-- of presentation other people see, and the map settings a visitor needs to
-- render someone's profile map.
revoke select on public.users from anon, authenticated;

grant select (
  id,
  handle,
  name,
  avatar_r2_key,
  bio,
  is_private,
  created_at,
  home_place_id,
  show_map,
  map_default_center_lat,
  map_default_center_lng,
  map_default_zoom,
  map_default_layers,
  profile_section_order
) on public.users to anon, authenticated;

-- UPDATE is untouched: users_update_own already restricts it to auth.uid(),
-- and the ban write guard (20260829180000) still applies on top.
