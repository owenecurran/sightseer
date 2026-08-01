create table public.blocks (
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- security definer + fixed search_path, same reasoning as
-- can_view_user_content: symmetric so callers don't need to check both
-- directions themselves.
create function public.is_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = user_a and blocked_id = user_b)
       or (blocker_id = user_b and blocked_id = user_a)
  );
$$;

alter table public.blocks enable row level security;

-- Only the blocker can ever read their own blocks — the blocked party gets
-- no signal they've been blocked (silent block); their loss of visibility
-- happens transparently via can_view_user_content below, not because they
-- can query this table.
create policy "blocks_select_own" on public.blocks for select using (auth.uid() = blocker_id);
create policy "blocks_insert_own" on public.blocks for insert with check (auth.uid() = blocker_id);
create policy "blocks_delete_own" on public.blocks for delete using (auth.uid() = blocker_id);

-- Re-gate the one function nearly every content policy already funnels
-- through (visits/photos/boards/travel_books/likes/comments/etc. all call
-- this) — a single change here hides content mutually everywhere at once.
create or replace function public.can_view_user_content(viewer_id uuid, owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not public.is_blocked(viewer_id, owner_id)
    and (
      viewer_id = owner_id
      or exists (select 1 from public.users u where u.id = owner_id and u.is_private = false)
      or exists (
        select 1 from public.follows f
        where f.follower_id = viewer_id and f.followee_id = owner_id and f.status = 'accepted'
      )
    );
$$;

-- Prevent starting a fresh follow with someone you've blocked or who's
-- blocked you (existing follows between the two are deleted client-side by
-- blockUser() at block time — see src/lib/blocks.ts).
drop policy "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows
  for insert with check (auth.uid() = follower_id and not public.is_blocked(auth.uid(), followee_id));

-- Same for tagging: can't tag someone you've blocked or who's blocked you
-- into a new visit.
drop policy "visit_tagged_users_insert_own_visit" on public.visit_tagged_users;
create policy "visit_tagged_users_insert_own_visit" on public.visit_tagged_users
  for insert with check (
    exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid())
    and not public.is_blocked(auth.uid(), user_id)
  );
