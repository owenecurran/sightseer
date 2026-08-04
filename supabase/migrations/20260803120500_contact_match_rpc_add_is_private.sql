-- Adds is_private to the match result so the client can pick the correct
-- follow status (pending vs accepted) via followUser's existing
-- followeeIsPrivate param, instead of guessing/always-accepted.
-- `create or replace` can't change a function's return type shape (adding a
-- column to the returned TABLE) — Postgres requires drop + recreate.
drop function public.match_contacts_by_hash(text[]);

create function public.match_contacts_by_hash(hashes text[])
returns table (id uuid, handle text, name text, is_private boolean)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.handle, u.name, u.is_private
  from public.users u
  where u.hashed_phone = any(hashes)
    and u.discoverable_by_contacts = true
    and u.id <> auth.uid();
$$;

grant execute on function public.match_contacts_by_hash(text[]) to authenticated;
