-- Adds a "place" attachment type to profile prompts (e.g. a "Next trip
-- destination" prompt answered with a real searched place instead of free
-- text). Places are shared/global rows, not user-owned, so unlike the
-- review/board clauses, no extra ownership check is needed in the
-- insert/update policies for this type.
alter table public.profile_prompt_attachments
  add column place_id uuid references public.places (id) on delete cascade;

alter table public.profile_prompt_attachments
  drop constraint profile_prompt_attachments_check;

alter table public.profile_prompt_attachments
  add constraint profile_prompt_attachments_check check (
    (attachment_type = 'text' and text_value is not null and photo_r2_key is null and visit_id is null and board_id is null and place_id is null)
    or (attachment_type = 'photo' and photo_r2_key is not null and text_value is null and visit_id is null and board_id is null and place_id is null)
    or (attachment_type = 'review' and visit_id is not null and text_value is null and photo_r2_key is null and board_id is null and place_id is null)
    or (attachment_type = 'board' and board_id is not null and text_value is null and photo_r2_key is null and visit_id is null and place_id is null)
    or (attachment_type = 'place' and place_id is not null and text_value is null and photo_r2_key is null and visit_id is null and board_id is null)
  );

alter table public.profile_prompt_attachments
  drop constraint profile_prompt_attachments_attachment_type_check;

alter table public.profile_prompt_attachments
  add constraint profile_prompt_attachments_attachment_type_check
  check (attachment_type in ('text', 'photo', 'review', 'board', 'place'));
