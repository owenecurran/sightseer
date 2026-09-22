-- Contact discovery that actually works, plus a notification when someone in
-- your phonebook joins.
--
-- THE STATE THIS STARTS FROM
--
-- Measured before writing, not assumed: 41 users, 0 with a hashed_phone, 0
-- with discoverable_by_contacts. The matching feature has shipped and has
-- never been able to match anybody, because the only way to record a number
-- is an optional field buried in Settings and the discoverable flag defaults
-- to false. "Already on Sightseer" has therefore always been empty and
-- everybody has always shown as invitable.
--
-- WHY THE HASHES GET PEPPERED
--
-- Notifying somebody later means keeping their address book, and an
-- address book is exactly the thing not to keep in a form that survives a
-- leak. The client sends sha256 of an E.164 number; that alone is weak,
-- because the North American number space is about 10^10 and a GPU walks
-- the whole of it in minutes. So nothing here stores what the client sent.
-- Every hash is re-keyed server-side with a secret that lives in a schema no
-- client role can reach, and only the result is written down. A dump of
-- contact_hashes without that secret is a column of noise.
--
-- The raw number still never leaves the device, exactly as before.

-- =========================================================================
-- The pepper
-- =========================================================================

create schema if not exists private;
-- No client role has any business in here. The functions below are
-- `security definer` and run as the owner, so they can still read it.
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
revoke all on table private.app_secrets from public, anon, authenticated;

-- Generated in the database, so it is never in this file, in the repo, or in
-- anybody's shell history. 32 bytes from pgcrypto's CSPRNG.
--
-- `on conflict do nothing` makes this migration safe to re-run: the pepper is
-- minted exactly once. Changing it later invalidates every stored hash —
-- every contact row would have to be re-uploaded and every phone re-entered —
-- so it is written once and left alone.
insert into private.app_secrets (name, value)
values ('contact_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- The one place a client-supplied hash becomes a stored one.
--
-- Deliberately in `private`: it is not callable from PostgREST, so nobody
-- can use it as an oracle to pepper hashes of their own choosing offline.
create or replace function private.pepper_contact_hash(p_hash text)
returns text
language sql
stable
security definer
set search_path = private, extensions, public
as $$
  select encode(
    extensions.hmac(
      p_hash,
      (select value from private.app_secrets where name = 'contact_pepper'),
      'sha256'
    ),
    'hex'
  );
$$;

-- =========================================================================
-- Storage
-- =========================================================================

-- Whose phonebook contains whom, as peppered hashes and nothing else.
--
-- No contact NAME is stored. The notification names the person who joined
-- using their own public profile — which they consented to being findable —
-- rather than the label you happened to save them under. That keeps the
-- nicknames in your phone on your phone, and it is the difference between a
-- leak of this table being embarrassing and it being a directory.
create table if not exists public.contact_hashes (
  owner_id uuid not null references public.users(id) on delete cascade,
  peppered_hash text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, peppered_hash)
);

-- The lookup the join trigger does: "who has this person in their contacts".
create index if not exists contact_hashes_by_hash on public.contact_hashes (peppered_hash);

alter table public.contact_hashes enable row level security;

-- No select policy at all, for anybody. Nothing in the app ever reads a row
-- back — the sync RPC returns matches, not stored hashes — and a table you
-- cannot read is a table that cannot be walked. Deletion is the one thing an
-- owner may do directly, so "delete what you uploaded" needs no RPC.
create policy "contact_hashes_delete_own" on public.contact_hashes
  for delete using (auth.uid() = owner_id);

-- Whether to be told at all. Matches the notify_likes / notify_follows
-- pattern and their default.
alter table public.users
  add column if not exists notify_contact_joins boolean not null default true;

-- =========================================================================
-- Writing your own number
-- =========================================================================

-- Replaces the client's direct `update users set hashed_phone = ...`, which
-- could only ever store the unpeppered value.
--
-- Setting a number turns discovery ON in the same statement. Entering it is
-- the opt-in — there is no other reason to type your phone number into this
-- app — and leaving it a second, separate toggle is what produced 41 users
-- with neither. Passing null clears both, which is the way out.
create or replace function public.set_my_phone_hash(p_hash text)
returns void
language plpgsql
volatile
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_hash is null then
    update public.users
    set hashed_phone = null,
        discoverable_by_contacts = false
    where id = auth.uid();
    return;
  end if;

  update public.users
  set hashed_phone = private.pepper_contact_hash(p_hash),
      discoverable_by_contacts = true
  where id = auth.uid();
end;
$$;

revoke all on function public.set_my_phone_hash(text) from public, anon;
grant execute on function public.set_my_phone_hash(text) to authenticated;

-- =========================================================================
-- Matching, and remembering who to tell later
-- =========================================================================

-- What the Find friends screen calls. Stores the phonebook AND returns the
-- matches, because both happen at the same moment and splitting them would
-- mean uploading the same hashes twice.
--
-- Returns the CLIENT's hash in `hashed_phone`, not the stored one. The
-- screen maps matches back to the contact they came from by that value, and
-- it has never seen a peppered hash in its life.
create or replace function public.sync_contact_hashes(p_hashes text[])
returns table (id uuid, handle text, name text, is_private boolean, hashed_phone text)
language plpgsql
volatile
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Replace rather than accumulate. A phonebook is a current state, not a
  -- log: somebody deleted from your contacts should stop being somebody you
  -- get told about.
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
  select u.id, u.handle, u.name, u.is_private, i.raw
  from input i
  join public.users u on u.hashed_phone = i.peppered
  where u.discoverable_by_contacts = true
    and u.id <> auth.uid()
    -- Somebody you have blocked, or who has blocked you, is not a
    -- suggestion. match_contacts_by_hash never checked this.
    and not public.is_blocked(auth.uid(), u.id)
    and not public.is_blocked(u.id, auth.uid());
end;
$$;

revoke all on function public.sync_contact_hashes(text[]) from public, anon;
grant execute on function public.sync_contact_hashes(text[]) to authenticated;

-- Forget the uploaded phonebook, without giving up an account.
create or replace function public.clear_contact_hashes()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.contact_hashes where owner_id = auth.uid();
$$;

revoke all on function public.clear_contact_hashes() from public, anon;
grant execute on function public.clear_contact_hashes() to authenticated;

-- The old read-only matcher, taught about the pepper.
--
-- Kept because it is already granted and already called; it now peppers what
-- it is given so it agrees with what set_my_phone_hash writes. Without this
-- it would silently match nothing forever.
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
  select u.id, u.handle, u.name, u.is_private, i.raw
  from input i
  join public.users u on u.hashed_phone = i.peppered
  where u.discoverable_by_contacts = true
    and u.id <> auth.uid()
    and not public.is_blocked(auth.uid(), u.id)
    and not public.is_blocked(u.id, auth.uid());
$$;

revoke all on function public.match_contacts_by_hash(text[]) from public, anon;
grant execute on function public.match_contacts_by_hash(text[]) to authenticated;

-- =========================================================================
-- "Someone in your contacts joined"
-- =========================================================================

-- One per person, ever.
--
-- The trigger fires whenever a number is set, and a number can be set more
-- than once — cleared and re-entered, or changed to a new phone. Without
-- this, each of those would be a fresh "they joined" for everybody who has
-- them saved. Same reasoning, and the same mechanism, as
-- notifications_one_like_per_actor_visit.
create unique index if not exists notifications_one_contact_joined_per_actor
  on public.notifications (recipient_id, actor_id)
  where type = 'contact_joined';

create or replace function public.notify_contact_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the moment a number first becomes matchable. An update that leaves
  -- the hash alone — a name change, a privacy toggle — is not a joining.
  if new.hashed_phone is null or new.hashed_phone is not distinct from old.hashed_phone then
    return new;
  end if;

  -- Their own setting decides whether this happens at all. Someone who is
  -- not discoverable by contacts does not get announced to contacts.
  if new.discoverable_by_contacts is not true then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type)
  select c.owner_id, new.id, 'contact_joined'
  from public.contact_hashes c
  where c.peppered_hash = new.hashed_phone
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
  after update of hashed_phone on public.users
  for each row execute function public.notify_contact_joined();
