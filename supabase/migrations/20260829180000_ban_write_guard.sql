-- The ban columns added in 20260829170000 were writable by their own owner.
--
-- users_update_own is `auth.uid() = id` with no column list, so a banned
-- user could clear banned_at with an ordinary PostgREST update and unban
-- themselves. A ban that the banned person can lift is not a ban.
--
-- Postgres has no column-level RLS, so the guard is a trigger. It leans on
-- current_user rather than any claim in the JWT: inside a SECURITY DEFINER
-- function current_user is the function owner, while an update arriving
-- straight from PostgREST runs as `authenticated`. So the two functions
-- below can write these columns and nothing reaching the table directly
-- can.
create or replace function public.guard_ban_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.banned_at is distinct from old.banned_at
     or new.ban_reason is distinct from old.ban_reason then
    if current_user = 'authenticated' then
      raise exception 'Ban state cannot be changed directly'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger users_guard_ban_columns
  before update on public.users
  for each row execute function public.guard_ban_columns();

-- The admin path. SECURITY DEFINER so it can pass the guard above, but it
-- re-checks is_admin itself — being definer means the function is the only
-- thing standing between any authenticated caller and banning anyone.
--
-- One function for both directions: passing null lifts the ban. A separate
-- unban function would be a second place to keep the admin check correct.
create or replace function public.set_user_banned(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin) then
    raise exception 'Not authorised' using errcode = 'insufficient_privilege';
  end if;

  update public.users
  set banned_at = case when p_reason is null then null else now() end,
      ban_reason = p_reason
  where id = p_user_id;
end;
$$;

revoke execute on function public.set_user_banned(uuid, text) from public;
grant execute on function public.set_user_banned(uuid, text) to authenticated;

-- The underage path, which no admin is present for.
--
-- Acts only on auth.uid(), so the worst anyone can do by calling it is ban
-- themselves, and it never lifts a ban — an account already banned for
-- abuse cannot launder that into the milder 'underage' reason.
--
-- Deliberately does not delete the account. A mistyped birth year is a
-- likelier cause than an actual child, and an admin can lift this; a
-- deletion would be unrecoverable and is the wrong default for a
-- self-reported number.
create or replace function public.flag_self_underage()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set banned_at = now(), ban_reason = 'underage'
  where id = auth.uid() and banned_at is null;
end;
$$;

revoke execute on function public.flag_self_underage() from public;
grant execute on function public.flag_self_underage() to authenticated;
