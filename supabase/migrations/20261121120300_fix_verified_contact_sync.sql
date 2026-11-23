create function private.require_contact_lookup(p_hashes text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.cardinality(p_hashes) > 5000 then
    raise exception 'too many contacts in one request' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from auth.users au where au.id = auth.uid() and au.phone_confirmed_at is not null
  ) then
    raise exception 'phone not verified' using errcode = 'P0002';
  end if;

  if not private.take_quota('contact_match', 30) then
    raise exception 'too many contact lookups, try later' using errcode = 'P0004';
  end if;
end;
$$;

create function private.contact_matches(p_hashes text[])
returns table (id uuid, handle text, name text, is_private boolean, hashed_phone text)
language sql
stable
set search_path = ''
as $$
  with input as (
    select h as raw, private.pepper_contact_hash(h) as peppered
    from pg_catalog.unnest(p_hashes) as h
    where h is not null and h <> ''
  )
  select distinct u.id, u.handle, u.name, u.is_private, i.raw
  from input i
  join public.users u on u.hashed_phone = i.peppered or u.hashed_email = i.peppered
  where u.discoverable_by_contacts and u.banned_at is null and u.id <> auth.uid()
    and not public.is_blocked(auth.uid(), u.id);
$$;

revoke all on function private.require_contact_lookup(text[]) from public, anon, authenticated;
revoke all on function private.contact_matches(text[]) from public, anon, authenticated;

create or replace function public.sync_contact_hashes(p_hashes text[])
returns table (id uuid, handle text, name text, is_private boolean, hashed_phone text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contact_lookup(p_hashes);

  delete from public.contact_hashes c where c.owner_id = auth.uid();
  insert into public.contact_hashes (owner_id, peppered_hash)
  select auth.uid(), private.pepper_contact_hash(h)
  from pg_catalog.unnest(p_hashes) as h
  where h is not null and h <> ''
  on conflict do nothing;

  return query select * from private.contact_matches(p_hashes);
end;
$$;

-- Read-only matching has the same account verification, quota and block rules.
create or replace function public.match_contacts_by_hash(hashes text[])
returns table (id uuid, handle text, name text, is_private boolean, hashed_phone text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_contact_lookup(hashes);
  return query select * from private.contact_matches(hashes);
end;
$$;
