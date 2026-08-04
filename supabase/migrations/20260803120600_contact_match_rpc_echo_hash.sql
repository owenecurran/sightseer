-- Echoes back the matched hashed_phone so the client can correlate a match
-- to which of its own input hashes (and therefore which device contact)
-- produced it — not a leak, since the client already possesses every hash
-- it sent; without this there's no way to tell two different contacts with
-- the same match apart, or to know which contacts had zero matches at all.
drop function public.match_contacts_by_hash(text[]);

create function public.match_contacts_by_hash(hashes text[])
returns table (id uuid, handle text, name text, is_private boolean, hashed_phone text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.handle, u.name, u.is_private, u.hashed_phone
  from public.users u
  where u.hashed_phone = any(hashes)
    and u.discoverable_by_contacts = true
    and u.id <> auth.uid();
$$;

grant execute on function public.match_contacts_by_hash(text[]) to authenticated;
