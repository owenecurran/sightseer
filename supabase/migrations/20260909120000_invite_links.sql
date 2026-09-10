-- Trackable invite links.
--
-- Until now the invite gate was honour-system: it shared a sentence with no
-- link in it and flipped users.has_shared_invite, so "who invited whom" was
-- unanswerable and the gate measured nothing but that a share sheet opened.
-- This gives every user one durable code, records opens of the link, and
-- records the attribution when someone signs up behind it.
--
-- Three tables rather than one column, because the three facts have
-- genuinely different lifetimes: the code outlives any particular click, a
-- click happens before the account it may or may not produce exists, and the
-- attribution belongs to the invited user's row and must survive the code
-- being revoked.

-- =========================================================================
-- invites
-- =========================================================================

-- Deliberately not a uuid: this ends up in a URL a person may read aloud or
-- type. Ambiguous glyphs are removed from the alphabet below for the same
-- reason.
create table public.invites (
  code text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Revoking rather than deleting: an invite that has already been redeemed
  -- is referenced by users.invited_via_code, and the attribution has to
  -- survive someone rotating their link.
  revoked_at timestamptz
);

-- One live code per user. A user may accumulate revoked ones; they may only
-- ever have a single code in circulation, which is what makes "this code
-- belongs to that person" a fact rather than a guess.
create unique index invites_one_active_per_user_idx
  on public.invites (user_id)
  where revoked_at is null;

create index invites_user_idx on public.invites (user_id);

-- =========================================================================
-- invite_clicks
-- =========================================================================

-- Every open of a link, whether or not it ever becomes an account. Recorded
-- from the public landing page, so this is the one table an unauthenticated
-- visitor can write to — see the tightly scoped function at the bottom,
-- which is the only granted path in.
create table public.invite_clicks (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.invites (code) on delete cascade,
  clicked_at timestamptz not null default now(),
  -- 'ios' | 'android' | 'web'. Free text rather than an enum so a new
  -- surface does not need a migration to start reporting; the set is small
  -- and only ever read for counting.
  platform text
);

create index invite_clicks_code_idx on public.invite_clicks (code, clicked_at desc);

-- =========================================================================
-- attribution, on the invited user's row
-- =========================================================================

alter table public.users
  -- Denormalised alongside the code on purpose. invited_via_code answers
  -- "which link", invited_by answers "which person", and the second must
  -- keep working if the first is ever revoked and reissued.
  add column invited_by uuid references public.users (id) on delete set null,
  add column invited_via_code text references public.invites (code) on delete set null,
  add column invite_attributed_at timestamptz;

create index users_invited_by_idx on public.users (invited_by)
  where invited_by is not null;

-- =========================================================================
-- code generation
-- =========================================================================

-- No 0/O/1/I/L: this is read off a screen and typed by hand often enough
-- that the pairs people confuse are not worth the extra entropy they buy.
-- 8 characters over a 31-glyph alphabet is ~39 bits, which at any plausible
-- user count leaves collisions to the retry loop below rather than to luck.
create function public.generate_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text := '';
  i integer;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- Returns the caller's live code, minting one on first use.
--
-- security definer because it inserts into invites, which has no insert
-- policy for clients — the only supported way to get a code is to ask for
-- your own, and that removes any question of a client writing someone
-- else's user_id into the table.
create function public.ensure_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  existing text;
  candidate text;
  attempt integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select code into existing
  from public.invites
  where user_id = auth.uid() and revoked_at is null;

  if existing is not null then
    return existing;
  end if;

  -- Retry rather than trust a single draw. The partial unique index above
  -- also means two concurrent calls by the same user cannot both mint a
  -- code; the loser raises unique_violation and re-reads the winner's.
  loop
    attempt := attempt + 1;
    candidate := public.generate_invite_code();
    begin
      insert into public.invites (code, user_id) values (candidate, auth.uid());
      return candidate;
    exception
      when unique_violation then
        select code into existing
        from public.invites
        where user_id = auth.uid() and revoked_at is null;
        if existing is not null then
          return existing;
        end if;
        if attempt >= 10 then
          raise;
        end if;
    end;
  end loop;
end;
$$;

grant execute on function public.ensure_invite_code() to authenticated;

-- =========================================================================
-- public resolution and click recording
-- =========================================================================

-- What the landing page shows a signed-out visitor: whose link is this.
--
-- Granted to anon, and deliberately narrow — handle and name only. That is
-- no more than users_select_all already exposes to anon for any profile;
-- the value here is that it does not also confirm anything about the code
-- beyond the fact that it resolves, and it returns nothing at all for a
-- revoked one.
create function public.resolve_invite(p_code text)
returns table (handle text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.handle, u.name
  from public.invites i
  join public.users u on u.id = i.user_id
  where i.code = p_code
    and i.revoked_at is null;
$$;

grant execute on function public.resolve_invite(text) to anon, authenticated;

-- Records an open of a link. Granted to anon because the whole point is to
-- count people who do not have an account yet.
--
-- Returns void and swallows an unknown code rather than raising: this is
-- fired from a page load, a stale or mistyped link is an ordinary event, and
-- an error here would be a broken landing page for the visitor. Counting is
-- best-effort by nature — an ad blocker or a prefetch already makes these
-- numbers approximate, so failing loudly buys nothing.
create function public.record_invite_click(p_code text, p_platform text default null)
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
  );
end;
$$;

grant execute on function public.record_invite_click(text, text) to anon, authenticated;

-- =========================================================================
-- redemption
-- =========================================================================

-- Called by a freshly created account to record who brought them.
--
-- Write-once by design: invite_attributed_at being already set is a silent
-- no-op, not an error. Attribution is a claim about how someone arrived, and
-- letting it be rewritten later would make it a claim about the last link
-- they happened to open instead.
create function public.redeem_invite(p_code text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  inviter uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Already attributed: leave it alone.
  if exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.invite_attributed_at is not null
  ) then
    return false;
  end if;

  select i.user_id into inviter
  from public.invites i
  where i.code = p_code and i.revoked_at is null;

  if inviter is null then
    return false;
  end if;

  -- Opening your own link is not an invite. Without this, the invite gate
  -- becomes "share a link, then click it yourself".
  if inviter = auth.uid() then
    return false;
  end if;

  update public.users
  set invited_by = inviter,
      invited_via_code = p_code,
      invite_attributed_at = now()
  where id = auth.uid()
    and invite_attributed_at is null;

  return found;
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;

-- =========================================================================
-- RLS
-- =========================================================================

alter table public.invites enable row level security;
alter table public.invite_clicks enable row level security;

-- You can see your own codes. Resolving someone else's is what
-- resolve_invite is for, which returns the inviter's public profile shell
-- and nothing about the invite itself — so a code cannot be used to probe
-- for other codes.
create policy "invites_select_own" on public.invites
  for select using (auth.uid() = user_id);

-- Revoking is the one thing a client may do directly; minting goes through
-- ensure_invite_code so that user_id is never client-supplied.
create policy "invites_update_own" on public.invites
  for update using (auth.uid() = user_id);

-- Your own link's clicks, for "12 people opened your invite". No insert
-- policy: record_invite_click is security definer and is the only way in.
create policy "invite_clicks_select_own" on public.invite_clicks
  for select using (
    exists (
      select 1 from public.invites i
      where i.code = invite_clicks.code and i.user_id = auth.uid()
    )
  );
