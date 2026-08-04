-- Matches a device's (already client-side-hashed) contact phone numbers
-- against existing accounts. A security-definer RPC rather than a direct
-- client select against `users`, so a client can only ever learn {id,
-- handle, name} for users who opted in (discoverable_by_contacts = true)
-- and matched a hash they already possess — never the raw hashed_phone
-- column itself, and never any row for a user who didn't opt in.
create function public.match_contacts_by_hash(hashes text[])
returns table (id uuid, handle text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.handle, u.name
  from public.users u
  where u.hashed_phone = any(hashes)
    and u.discoverable_by_contacts = true
    and u.id <> auth.uid();
$$;

grant execute on function public.match_contacts_by_hash(text[]) to authenticated;
