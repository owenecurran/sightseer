-- Four unauthenticated or unbounded surfaces, closed.
--
--   1. invite codes were drawn from random(), a non-cryptographic PRNG
--   2. record_invite_click was an unbounded anonymous INSERT
--   3. contact matching had no cap on probing
--   4. six RLS-bypassing read RPCs were callable by anon by accident
--
-- None of these needs a client change.

-- =========================================================================
-- 1. Invite codes from a CSPRNG
-- =========================================================================
--
-- `random()` is a deterministic PRNG seeded per session. It is the wrong tool
-- for a value that is effectively a bearer token: resolve_invite is callable
-- by anon and returns the inviter's handle and name, so a guessable code is a
-- way to harvest who is on the app.
--
-- gen_random_bytes is pgcrypto's CSPRNG, already relied on in this schema for
-- the contact-hash pepper.
--
-- The alphabet and length are unchanged, so every code already issued stays
-- valid and the same shape — 31^8, about 38 bits. That is thin for an
-- enumerable endpoint on its own, which is why the click cap below matters
-- too; widening the code would invalidate links already sent, so it is left
-- for a deliberate decision rather than smuggled in here.
--
-- The modulo is very slightly biased (256 is not a multiple of 31). For a
-- ~0.4% skew per character on an invite code that is an acceptable trade
-- against a rejection-sampling loop; it is not a cryptographic key.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea := extensions.gen_random_bytes(8);
  result text := '';
  i integer;
begin
  for i in 0..7 loop
    result := result || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
  end loop;
  return result;
end;
$$;

-- =========================================================================
-- 2. A ceiling on anonymous click recording
-- =========================================================================
--
-- An invite link is public by design, so its code is known to anyone holding
-- it — and record_invite_click is granted to anon and inserts a row per call
-- with no limit. One visitor in a loop could grow invite_clicks without
-- bound and make every invite statistic meaningless.
--
-- 60 an hour per code: far above a real link being opened and shared, far
-- below anything worth doing on purpose. Counting is already best-effort by
-- nature (ad blockers, prefetches), so dropping the overflow silently is
-- consistent with how this function already treats an unknown code.
--
-- invite_clicks_code_idx is (code, clicked_at desc), so the count is an index
-- range scan rather than a table scan.
create or replace function public.record_invite_click(p_code text, p_platform text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.invite_clicks (code, platform)
  select p_code, p_platform
  where exists (
    select 1 from public.invites i
    where i.code = p_code and i.revoked_at is null
  )
  and (
    select count(*) from public.invite_clicks c
    where c.code = p_code and c.clicked_at > now() - interval '1 hour'
  ) < 60;
end;
$$;

-- =========================================================================
-- 3. A budget for contact matching
-- =========================================================================
--
-- Both matching functions take an array of hashes and report which ones
-- belong to an account. That is the feature; it is also an oracle, and
-- nothing stopped an account from working through a dictionary of every
-- plausible phone number to find out who is here.
--
-- Two limits, deliberately shaped so an ordinary sync never meets either:
--
--   SIZE  5000 hashes a call. A large address book is a few thousand entries
--         and every number and address is hashed separately, so this is
--         generous; it only rules out the single enormous probe.
--
--   CALLS 30 an hour. Opening the find-friends screen and syncing is one
--         call. Thirty is well past any real use and far below what
--         enumeration needs.
--
-- Counted per account rather than per IP because this endpoint is
-- authenticated — an account is the thing being limited, and it is the thing
-- that can be banned.
create table if not exists public.rpc_quota (
  user_id uuid not null references public.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  used integer not null default 0,
  primary key (user_id, bucket, window_start)
);

alter table public.rpc_quota enable row level security;
-- No policies on purpose. Nothing reads this from the client; it is written
-- only by the definer function below, the same arrangement client_errors has.

create or replace function private.take_quota(
  p_bucket text,
  p_limit integer,
  p_window interval default '1 hour'
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_used integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- Upsert then read, so two concurrent calls cannot both see "0 used".
  insert into public.rpc_quota (user_id, bucket, window_start, used)
  values (auth.uid(), p_bucket, v_window, 1)
  on conflict (user_id, bucket, window_start)
    do update set used = rpc_quota.used + 1
  returning used into v_used;

  -- Tidy as we go rather than needing a scheduled job for four columns.
  delete from public.rpc_quota
  where window_start < now() - (p_window * 24);

  return v_used <= p_limit;
end;
$$;

revoke all on function private.take_quota(text, integer, interval) from public, anon, authenticated;

create or replace function public.match_contacts_by_hash(hashes text[])
returns table (id uuid, handle text, name text, is_private boolean, hashed_phone text)
language plpgsql
-- VOLATILE, where this used to be STABLE. A stable function executes in a
-- read-only context, so the quota row take_quota writes would be rejected at
-- runtime with "INSERT is not allowed in a non-volatile function". Counting a
-- call is a write; the function that counts cannot claim not to write.
volatile
security definer
set search_path = public, private
as $$
begin
  if array_length(hashes, 1) > 5000 then
    raise exception 'too many contacts in one request' using errcode = 'P0004';
  end if;
  if not private.take_quota('contact_match', 30) then
    raise exception 'too many contact lookups, try later' using errcode = 'P0004';
  end if;

  return query
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
      and u.banned_at is null;
end;
$$;

revoke all on function public.match_contacts_by_hash(text[]) from public, anon;
grant execute on function public.match_contacts_by_hash(text[]) to authenticated;

-- The same caps on sync_contact_hashes, which is the door the app actually
-- uses. match_contacts_by_hash is the read-only twin and is currently unused
-- by the client; limiting only that one would have locked the side door and
-- left the main one open, since both answer the identical question.
--
-- Reproduced in full rather than wrapped: create or replace needs the whole
-- body, and the body below is unchanged from
-- 20260922150000_verified_phone_and_email.sql apart from the two guards.
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

  if array_length(p_hashes, 1) > 5000 then
    raise exception 'too many contacts in one request' using errcode = 'P0004';
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

  -- Checked AFTER the verification gate, so an unverified account spends no
  -- budget finding out it is unverified.
  if not private.take_quota('contact_match', 30) then
    raise exception 'too many contact lookups, try later' using errcode = 'P0004';
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

-- =========================================================================
-- 4. Six read RPCs that anon was never meant to have
-- =========================================================================
--
-- Postgres grants EXECUTE to PUBLIC on a new function by default, and these
-- six were never revoked. They are SECURITY DEFINER, so they run past RLS;
-- what keeps them honest is a can_view_user_content(auth.uid(), …) filter,
-- which for an anonymous caller resolves to "every public account".
--
-- That is not a breach so much as a surface nobody chose: an unauthenticated,
-- RLS-bypassing, unaudited read of the place and trip graph. Every caller in
-- the app is behind a signed-in screen — checked, none are reachable from the
-- web landing or the invite page — so anon loses nothing by this.
--
-- resolve_invite and record_invite_click are deliberately NOT in this list:
-- the invite landing is anonymous by definition and they stay granted.
-- Looked up by OID rather than written as signatures. get_discover_places
-- takes six arguments with defaults and a comment inside its parameter list;
-- a hand-written signature here would have to match it exactly, would break
-- silently the next time an argument is added, and would take the whole
-- migration down with it. This finds whatever is actually there.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_discover_places',
        'get_popular_places',
        'get_trips_for_users',
        'get_collection_stats',
        'get_place_ancestry',
        'resolve_state_countries'
      )
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;
