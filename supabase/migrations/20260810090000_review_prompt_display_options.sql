-- 'review'-attachment-only display toggles: whether the review's own note
-- text shows at all (when off, review-prompt-card.tsx drops the side info
-- column entirely and lets the photo take the full card instead — see that
-- component), and whether the floating corner rating stamp shows. Both
-- default true so every existing 'review' attachment keeps looking exactly
-- as it did before this migration.

alter table public.profile_prompt_attachments
  add column show_note boolean not null default true;

alter table public.profile_prompt_attachments
  add column show_rating_stamp boolean not null default true;

alter table public.profile_prompt_attachments
  drop constraint profile_prompt_attachments_check;

alter table public.profile_prompt_attachments
  add constraint profile_prompt_attachments_check check (
    (attachment_type = 'text' and text_value is not null and photo_r2_key is null and visit_id is null and board_id is null and place_id is null and travel_book_id is null and cover_photo_id is null and display_mode is null and grid_photo_ids is null)
    or (attachment_type = 'photo' and photo_r2_key is not null and text_value is null and visit_id is null and board_id is null and place_id is null and travel_book_id is null and cover_photo_id is null and display_mode is null and grid_photo_ids is null)
    or (attachment_type = 'review' and visit_id is not null and text_value is null and photo_r2_key is null and board_id is null and place_id is null and travel_book_id is null and cover_photo_id is null and display_mode is null and grid_photo_ids is null)
    -- board/travel_book may optionally carry EITHER a single cover_photo_id
    -- OR up to 4 grid_photo_ids, never both at once.
    or (attachment_type = 'board' and board_id is not null and text_value is null and photo_r2_key is null and visit_id is null and place_id is null and travel_book_id is null and not (cover_photo_id is not null and grid_photo_ids is not null))
    or (attachment_type = 'place' and place_id is not null and text_value is null and photo_r2_key is null and visit_id is null and board_id is null and travel_book_id is null and display_mode is null and grid_photo_ids is null)
    or (attachment_type = 'travel_book' and travel_book_id is not null and text_value is null and photo_r2_key is null and visit_id is null and board_id is null and place_id is null and not (cover_photo_id is not null and grid_photo_ids is not null))
  );
