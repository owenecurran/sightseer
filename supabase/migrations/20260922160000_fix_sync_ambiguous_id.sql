-- Fix an ambiguous `id` in sync_contact_hashes.
--
-- The function RETURNS TABLE (id uuid, ...), which puts `id` in scope as an
-- OUT parameter for the whole body. The phone-verification guard added in
-- the previous migration then said:
--
--     select 1 from auth.users where id = auth.uid()
--
-- and Postgres cannot tell that `id` from the output column, so the whole
-- call fails with 42702 before it does anything. Every contact sync was
-- refused — including from accounts that HAD verified — so the gate looked
-- like it was working while actually being broken shut.
--
-- Found by exercising both sides of the gate rather than only the refusing
-- one: a test that checks a door is locked passes just as happily when the
-- door is bricked up.
create or replace function public.sync_contact_hashes(p_hashes text[])
returns table (id uuid, handle text, name text, is_private boolean, hashed_phone text)
language plpgsql
volatile
security definer
set search_path = public, private, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Aliased, and every column qualified through the alias. The OUT
  -- parameters shadow anything unqualified in here.
  if not exists (
    select 1 from auth.users au
    where au.id = auth.uid() and au.phone_confirmed_at is not null
  ) then
    raise exception 'phone not verified' using errcode = 'P0002';
  end if;

  delete from public.contact_hashes c where c.owner_id = auth.uid();

  insert into public.contact_hashes (owner_id, peppered_hash)
  select auth.uid(), private.pepper_contact_hash(h)
  from unnest(p_hashes) as h
  where h is not null and h <> ''
  on conflict do nothing;

  return query
  with input as (
    select h as raw, private.pepper_contact_hash(h) as peppered
    from unnest(p_hashes) as h
    where h is not null and h <> ''
  )
  select distinct u.id, u.handle, u.name, u.is_private, i.raw
  from input i
  join public.users u
    on u.hashed_phone = i.peppered or u.hashed_email = i.peppered
  where u.discoverable_by_contacts = true
    and u.id <> auth.uid()
    and not public.is_blocked(auth.uid(), u.id)
    and not public.is_blocked(u.id, auth.uid());
end;
$$;

revoke all on function public.sync_contact_hashes(text[]) from public, anon;
grant execute on function public.sync_contact_hashes(text[]) to authenticated;
