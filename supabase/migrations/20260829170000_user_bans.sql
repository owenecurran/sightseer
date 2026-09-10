-- Account bans, and the underage case as one of them.
--
-- Deliberately one mechanism rather than two. A user who declares an age
-- under the minimum and a user removed for abuse need the same outcome —
-- signed in but unable to act — and the same escape hatch, an admin who can
-- undo it when someone mistyped their birth year. Two systems would mean two
-- places to check and two places to forget.
alter table public.users
  add column banned_at timestamptz,
  -- Free text rather than an enum: the reason is shown to admins and, in the
  -- underage case, drives the wording the user sees. 'underage' is the only
  -- value the app writes itself; the rest come from moderation.
  add column ban_reason text;

create index users_banned_idx on public.users (banned_at) where banned_at is not null;

-- Used inside RLS policies, so it must be SECURITY DEFINER: a banned user
-- can still read their own row, but policies on OTHER tables need to ask
-- this question regardless of who is asking.
create or replace function public.is_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u where u.id = p_user_id and u.banned_at is not null
  );
$$;

grant execute on function public.is_banned(uuid) to authenticated;

-- Enforced in the database, not just by hiding screens. A ban that only
-- removes UI is bypassed by anything holding the user's token, and the whole
-- point of a ban is that it holds against someone motivated to get around
-- it.
--
-- Applied to the write paths that create content or reach other people.
-- Reads are deliberately untouched. The app already routes a banned user to
-- a single explaining screen and nowhere else, so this is not what keeps
-- them out of the feed; it is the backstop for a client that ignores that
-- routing. Cutting reads here would also break the ban screen, which has to
-- read the banned user's own profile to know why they are banned.
alter policy "visits_insert_own" on public.visits
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));

alter policy "comments_insert" on public.comments
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));

alter policy "likes_insert_own" on public.likes
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));
