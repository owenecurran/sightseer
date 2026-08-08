-- Redesigns place/board/travel_book prompt-attachment photos: instead of a
-- manually uploaded/cropped photo (photo_r2_key, added earlier today for
-- 'place' only, never actually shipped in the UI) or no photo at all
-- (board/travel_book), all three now reference a photo that already exists
-- on one of the reviews inside them:
--   - 'place': cover_photo_id, picked from photos on reviews of that place.
--   - 'board'/'travel_book': either cover_photo_id (one featured photo) or
--     up to 4 grid_photo_ids, picked from photos on reviews saved in it.
-- These are plain references into the existing photos table, resolved
-- through the same getPhotoViewUrls/photos_select RLS path 'review'
-- attachments already use via visit_photo_id — no new upload or edge
-- function plumbing needed.

alter table public.profile_prompt_attachments
  add column cover_photo_id uuid references public.photos (id) on delete set null;

alter table public.profile_prompt_attachments
  add column display_mode text check (display_mode in ('cover', 'grid'));

alter table public.profile_prompt_attachments
  add column grid_photo_ids uuid[];

alter table public.profile_prompt_attachments
  add constraint profile_prompt_attachments_grid_length_check
  check (grid_photo_ids is null or array_length(grid_photo_ids, 1) <= 4);

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
