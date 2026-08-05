-- Travel books as a prompt-answer attachment type, mirroring the 'place'
-- addition in 20260731120500_prompt_place_attachment.sql exactly. Deliberately
-- owner-only (not collaborator-inclusive), same restriction the mirrored
-- 'board' clause already has — the client picker sources from
-- listUserTravelBooks (owner-only), not listMyTravelBooks, to match.
alter table public.profile_prompt_attachments
  add column travel_book_id uuid references public.travel_books (id) on delete cascade;

alter table public.profile_prompt_attachments
  drop constraint profile_prompt_attachments_check;

alter table public.profile_prompt_attachments
  add constraint profile_prompt_attachments_check check (
    (attachment_type = 'text' and text_value is not null and photo_r2_key is null and visit_id is null and board_id is null and place_id is null and travel_book_id is null)
    or (attachment_type = 'photo' and photo_r2_key is not null and text_value is null and visit_id is null and board_id is null and place_id is null and travel_book_id is null)
    or (attachment_type = 'review' and visit_id is not null and text_value is null and photo_r2_key is null and board_id is null and place_id is null and travel_book_id is null)
    or (attachment_type = 'board' and board_id is not null and text_value is null and photo_r2_key is null and visit_id is null and place_id is null and travel_book_id is null)
    or (attachment_type = 'place' and place_id is not null and text_value is null and photo_r2_key is null and visit_id is null and board_id is null and travel_book_id is null)
    or (attachment_type = 'travel_book' and travel_book_id is not null and text_value is null and photo_r2_key is null and visit_id is null and board_id is null and place_id is null)
  );

alter table public.profile_prompt_attachments
  drop constraint profile_prompt_attachments_attachment_type_check;

alter table public.profile_prompt_attachments
  add constraint profile_prompt_attachments_attachment_type_check
  check (attachment_type in ('text', 'photo', 'review', 'board', 'place', 'travel_book'));

drop policy "profile_prompt_attachments_insert" on public.profile_prompt_attachments;
create policy "profile_prompt_attachments_insert" on public.profile_prompt_attachments
  for insert with check (
    exists (select 1 from public.profile_prompts pp where pp.id = prompt_id and pp.user_id = auth.uid())
    and (attachment_type <> 'review' or exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid()))
    and (attachment_type <> 'board' or exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()))
    and (attachment_type <> 'travel_book' or exists (select 1 from public.travel_books tb where tb.id = travel_book_id and tb.user_id = auth.uid()))
  );

drop policy "profile_prompt_attachments_update" on public.profile_prompt_attachments;
create policy "profile_prompt_attachments_update" on public.profile_prompt_attachments
  for update using (
    exists (select 1 from public.profile_prompts pp where pp.id = prompt_id and pp.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.profile_prompts pp where pp.id = prompt_id and pp.user_id = auth.uid())
    and (attachment_type <> 'review' or exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid()))
    and (attachment_type <> 'board' or exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()))
    and (attachment_type <> 'travel_book' or exists (select 1 from public.travel_books tb where tb.id = travel_book_id and tb.user_id = auth.uid()))
  );
