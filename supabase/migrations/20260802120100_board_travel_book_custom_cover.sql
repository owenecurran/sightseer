-- A standalone cover image, unrelated to any saved item/review — distinct
-- from the existing cover_photo_id (a FK into `photos`, which always
-- belongs to a visit; photos.visit_id is not null, so it structurally can't
-- represent "a photo not tied to a trip"). Same R2-key-on-the-row pattern
-- already used for users.avatar_r2_key. No RLS change needed — boards/
-- travel_books already have owner-only UPDATE policies that cover this
-- column like any other.
alter table public.boards add column cover_photo_r2_key text;
alter table public.travel_books add column cover_photo_r2_key text;
