-- Fixes an oversight in the immediately-preceding migration: draft_visits.rating
-- was created as smallint 1-5, but visits.rating is numeric(3,1) 0-10 (see
-- 20260724120000_rating_decimal_scale.sql) — the scale the RatingSlider
-- component and every rating display in this app actually use. Caught before
-- publish_draft() (next migration) ever inserted a draft's rating into
-- visits.rating, which would otherwise have silently mismatched.
alter table public.draft_visits drop constraint draft_visits_rating_check;
alter table public.draft_visits alter column rating type numeric(3,1) using rating::numeric(3,1);
alter table public.draft_visits add constraint draft_visits_rating_check check (rating >= 0 and rating <= 10);
