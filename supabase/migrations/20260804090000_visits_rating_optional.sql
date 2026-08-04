-- Ratings are now optional: the review-form's slider starts unset (see
-- rating-slider.tsx) rather than defaulting to a misleading 5.0, and saving
-- without ever touching it now saves a real "I've been here" visit with no
-- score attached, instead of requiring a separate "add without reviewing"
-- path. The existing check constraint already tolerates null (CHECK is
-- vacuously satisfied for null operands in Postgres), so only the NOT NULL
-- needs dropping.
alter table public.visits alter column rating drop not null;
