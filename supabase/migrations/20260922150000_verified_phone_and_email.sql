-- Contact matching keyed on things the server has VERIFIED, not on things
-- the client asserted.
--
-- WHAT WAS WRONG WITH THE OLD WAY
--
-- set_my_phone_hash took a hash the client computed and stored it. Nothing
-- checked that the number behind it belonged to the person typing it, so
-- anybody could claim anybody's number and be found in their friends'
-- contact lists. Harmless while nobody had set one — nobody had — and not
-- something to ship to a beta.
--
-- With Twilio Verify wired into Supabase Auth, auth.users.phone carries a
-- number somebody proved they could receive an SMS at. That is the value
-- worth hashing, and the client never gets a say in it: the function below
-- reads it from auth.users directly.
--
-- Email comes along for the ride because the account already has a verified
-- one. It matches far less often than a phone number — address books are
-- thin on emails, people sign up with a different address than the one you
-- saved, and an Apple private-relay address (2 of this project's 3 Apple
-- accounts) can never appear in anybody's contacts at all — so it is a
-- fallback, not a second front door.

-- =========================================================================
-- Storage
-- =========================================================================

-- Peppered exactly like hashed_phone, by the same function, so neither is
-- readable from a dump without the key in `private`.
alter table public.users
  add column if not exists hashed_email text;

create index if not exists users_hashed_email on public.users (hashed_email)
  where hashed_email is not null;

-- =========================================================================
-- Normalisation
-- =========================================================================

-- The device side hashes sha256 of an E.164 string built by normalizePhone
-- in src/lib/contacts.ts: digits, with a leading '+'. Anything derived here
-- has to land on byte-identical input or the two silently never match, which
-- is the failure mode this whole feature has already had once.
--
-- GoTrue stores phone numbers without the '+', so this adds it back rather
-- than assuming either shape — it strips to digits and prefixes, which is
-- correct whichever way the stored value happens to look.
create or replace function private.normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when p_phone is null or p_phone = '' then null
    else '+' || regexp_replace(p_phone, '[^0-9]', '', 'g')
  end;
$$;

-- Lowercased and trimmed, because an address book's capitalisation is
-- nobody's idea of meaningful. Deliberately NOT doing Gmail's dot-and-plus
-- folding: it is correct for gmail.com and wrong everywhere else, and a
-- false match here puts a stranger in somebody's friend list.
create or replace function private.normalize_email(p_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(coalesce(p_email, ''))), '');
$$;

-- =========================================================================
-- Deriving the hashes from verified identity
-- =========================================================================

-- Takes nothing. That is the point — there is no parameter for a caller to
-- lie in. It reads whatever auth has confirmed for this user and derives
-- both hashes from that.
--
-- Returns what it managed to set, so the client can tell the difference
-- between "verified and now findable" and "no confirmed number yet".
create or replace function public.sync_verified_contact_keys()
returns table (has_phone boolean, has_email boolean)
language plpgsql
volatile
security definer
set search_path = public, private, auth, extensions
as $$
declare
  v_phone text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- phone_confirmed_at, not phone: an unconfirmed number is a claim, and a
  -- claim is exactly what this function exists to stop storing.
  select private.normalize_phone(u.phone)
    into v_phone
  from auth.users u
  where u.id = auth.uid() and u.phone_confirmed_at is not null;

  select private.normalize_email(u.email)
    into v_email
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;

  update public.users
  set hashed_phone = case
        when v_phone is null then hashed_phone
        else private.pepper_contact_hash(encode(extensions.digest(v_phone, 'sha256'), 'hex'))
      end,
      hashed_email = case
        when v_email is null then hashed_email
        else private.pepper_contact_hash(encode(extensions.digest(v_email, 'sha256'), 'hex'))
      end,
      -- Verifying a number IS the opt-in, same reasoning as before: there is
      -- no other reason to prove ownership of a phone number to this app.
      discoverable_by_contacts = case
        when v_phone is not null or v_email is not null then true
        else discoverable_by_contacts
      end
  where id = auth.uid();

  return query select v_phone is not null, v_email is not null;
end;
$$;

revoke all on function public.sync_verified_contact_keys() from public, anon;
grant execute on function public.sync_verified_contact_keys() to authenticated;

-- The old client-trusting setter is gone. Keeping it would leave the door it
-- opened propped open next to the one that replaced it.
drop function if exists public.set_my_phone_hash(text);

-- =========================================================================
-- Matching, now on either key
-- =========================================================================

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

  -- Finding contacts requires having verified a number yourself.
  --
  -- Not arbitrary gatekeeping: matching is mutual by construction, and an
  -- account that reads the directory without appearing in it is exactly the
  -- shape of a scraper. Requiring the same proof everyone else gave keeps
  -- the two sides symmetrical.
  if not exists (
    select 1 from auth.users
    where id = auth.uid() and phone_confirmed_at is not null
  ) then
    raise exception 'phone not verified' using errcode = 'P0002';
  end if;

  delete from public.contact_hashes where owner_id = auth.uid();

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
  -- Either key. A contact card can carry a number, an address, or both, and
  -- the client hashes each of them the same way without knowing which is
  -- which — so this just asks whether either column matches.
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

-- Same widening for the read-only matcher.
drop function if exists public.match_contacts_by_hash(text[]);

create function public.match_contacts_by_hash(hashes text[])
returns table (id uuid, handle text, name text, is_private boolean, hashed_phone text)
language sql
stable
security definer
set search_path = public, private
as $$
  with input as (
    select h as raw, private.pepper_contact_hash(h) as peppered
    from unnest(hashes) as h
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
$$;

revoke all on function public.match_contacts_by_hash(text[]) from public, anon;
grant execute on function public.match_contacts_by_hash(text[]) to authenticated;

-- =========================================================================
-- "Someone in your contacts joined", for either key
-- =========================================================================

create or replace function public.notify_contact_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_keys text[];
begin
  -- Whichever key just became matchable. Both are checked because an
  -- account can gain a phone hash and an email hash at different moments —
  -- email on sign-up, phone whenever they get round to verifying.
  v_new_keys := array_remove(array[
    case when new.hashed_phone is distinct from old.hashed_phone then new.hashed_phone end,
    case when new.hashed_email is distinct from old.hashed_email then new.hashed_email end
  ], null);

  if array_length(v_new_keys, 1) is null then
    return new;
  end if;

  if new.discoverable_by_contacts is not true then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type)
  select distinct c.owner_id, new.id, 'contact_joined'
  from public.contact_hashes c
  where c.peppered_hash = any(v_new_keys)
    and c.owner_id <> new.id
    and exists (
      select 1 from public.users u
      where u.id = c.owner_id and u.notify_contact_joins = true
    )
    and not public.is_blocked(c.owner_id, new.id)
    and not public.is_blocked(new.id, c.owner_id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists users_notify_contact_joined on public.users;
create trigger users_notify_contact_joined
  after update of hashed_phone, hashed_email on public.users
  for each row execute function public.notify_contact_joined();
