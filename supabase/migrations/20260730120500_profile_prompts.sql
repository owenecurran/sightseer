create table public.profile_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  prompt_slug text not null,
  position smallint not null check (position between 0 and 5),
  answer_type text not null check (answer_type in ('photo', 'review', 'text', 'board')),
  text_answer text,
  photo_r2_key text,
  visit_id uuid references public.visits (id) on delete cascade,
  board_id uuid references public.boards (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, position),
  check (
    (answer_type = 'text' and text_answer is not null and photo_r2_key is null and visit_id is null and board_id is null)
    or (answer_type = 'photo' and photo_r2_key is not null and text_answer is null and visit_id is null and board_id is null)
    or (answer_type = 'review' and visit_id is not null and text_answer is null and photo_r2_key is null and board_id is null)
    or (answer_type = 'board' and board_id is not null and text_answer is null and photo_r2_key is null and visit_id is null)
  )
);

alter table public.profile_prompts enable row level security;

-- Same visibility rule as every other user-owned content table: a prompt
-- pointing at a review/board is exactly as visible as that content already
-- is, no special-casing.
create policy "profile_prompts_select" on public.profile_prompts
  for select using (public.can_view_user_content(auth.uid(), user_id));

-- RLS visibility isn't ownership: a 'review'/'board' answer must reference
-- content the caller actually owns, not just something they can see (same
-- double-check pattern used in the visit-photo-upload Edge Function).
create policy "profile_prompts_insert" on public.profile_prompts
  for insert with check (
    auth.uid() = user_id
    and (answer_type <> 'review' or exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid()))
    and (answer_type <> 'board' or exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()))
  );

create policy "profile_prompts_update" on public.profile_prompts
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (answer_type <> 'review' or exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid()))
    and (answer_type <> 'board' or exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()))
  );

create policy "profile_prompts_delete" on public.profile_prompts
  for delete using (auth.uid() = user_id);
