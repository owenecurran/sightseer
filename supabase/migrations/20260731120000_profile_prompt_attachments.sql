-- Redesign profile_prompts before more UI gets built on top of it: split
-- into a header row (just the slot + which question it answers) and a new
-- one-to-many attachments table, so a single prompt can eventually hold
-- several photos/reviews/etc instead of exactly one. No real user data
-- exists on this table yet (only throwaway test accounts so far), so this
-- is a clean cut, not a backfill migration.
drop policy "profile_prompts_insert" on public.profile_prompts;
drop policy "profile_prompts_update" on public.profile_prompts;

alter table public.profile_prompts drop constraint profile_prompts_check;
alter table public.profile_prompts drop column answer_type;
alter table public.profile_prompts drop column text_answer;
alter table public.profile_prompts drop column photo_r2_key;
alter table public.profile_prompts drop column visit_id;
alter table public.profile_prompts drop column board_id;

-- Dropped the (user_id, position) uniqueness too: with reordering now
-- supported (simple up/down swap, not drag), enforcing a hard DB-level
-- uniqueness on position would need a deferred-constraint RPC to swap two
-- rows atomically. Position here is purely a sort key for a table only its
-- owner ever writes — a transient duplicate between two sequential client
-- update calls is harmless (never visible to any other reader), so a plain
-- non-unique smallint is the pragmatic choice.
alter table public.profile_prompts drop constraint profile_prompts_user_id_position_key;

create policy "profile_prompts_insert" on public.profile_prompts
  for insert with check (auth.uid() = user_id);

create policy "profile_prompts_update" on public.profile_prompts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.profile_prompt_attachments (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.profile_prompts (id) on delete cascade,
  position smallint not null default 0,
  attachment_type text not null check (attachment_type in ('photo', 'review', 'text', 'board')),
  text_value text,
  photo_r2_key text,
  visit_id uuid references public.visits (id) on delete cascade,
  board_id uuid references public.boards (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (attachment_type = 'text' and text_value is not null and photo_r2_key is null and visit_id is null and board_id is null)
    or (attachment_type = 'photo' and photo_r2_key is not null and text_value is null and visit_id is null and board_id is null)
    or (attachment_type = 'review' and visit_id is not null and text_value is null and photo_r2_key is null and board_id is null)
    or (attachment_type = 'board' and board_id is not null and text_value is null and photo_r2_key is null and visit_id is null)
  )
);

alter table public.profile_prompt_attachments enable row level security;

-- Visible whenever the parent prompt is (which is itself already gated by
-- can_view_user_content) — no separate visibility rule needed.
create policy "profile_prompt_attachments_select" on public.profile_prompt_attachments
  for select using (
    exists (select 1 from public.profile_prompts pp where pp.id = prompt_id and public.can_view_user_content(auth.uid(), pp.user_id))
  );

create policy "profile_prompt_attachments_insert" on public.profile_prompt_attachments
  for insert with check (
    exists (select 1 from public.profile_prompts pp where pp.id = prompt_id and pp.user_id = auth.uid())
    and (attachment_type <> 'review' or exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid()))
    and (attachment_type <> 'board' or exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()))
  );

create policy "profile_prompt_attachments_update" on public.profile_prompt_attachments
  for update using (
    exists (select 1 from public.profile_prompts pp where pp.id = prompt_id and pp.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.profile_prompts pp where pp.id = prompt_id and pp.user_id = auth.uid())
    and (attachment_type <> 'review' or exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid()))
    and (attachment_type <> 'board' or exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()))
  );

create policy "profile_prompt_attachments_delete" on public.profile_prompt_attachments
  for delete using (
    exists (select 1 from public.profile_prompts pp where pp.id = prompt_id and pp.user_id = auth.uid())
  );
