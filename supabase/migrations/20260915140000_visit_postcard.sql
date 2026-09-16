-- The postcard a review is printed on, fixed at the moment it is written.
--
-- Until now every one of these was derived at render time by hashing the
-- visit id: which sheet, which grain plate, which stamp design, which way up.
-- That is stable across renders, which was the point, but it is not stable
-- across anything else. The stamp is chosen partly from the review's tags, so
-- editing a tag silently reprinted the stamp. The orientation is chosen from
-- the photos' aspect ratios, so replacing a photo turned the card. And
-- neither was ever the author's choice, which two of these now are.
--
-- All nullable, and all resolved client-side to the old hashed value when
-- null. Every review written before this keeps exactly the card it has rather
-- than being backfilled into a different one.

alter table public.visits
  -- Index into the sheet list. Wrapped modulo the list length when read, so
  -- retiring a sheet renumbers rather than breaks.
  add column if not exists card_stock integer,
  -- Index into the dust/scratch plates.
  add column if not exists card_grain integer,
  -- The stamp design id (see stamp-matching.ts), stored rather than matched
  -- so that editing a review's tags cannot change the stamp already on it.
  add column if not exists card_stamp text,
  -- 'horizontal' | 'vertical'. The author's choice; falls back to whatever
  -- the photos imply.
  add column if not exists card_orientation text,
  -- 'picture' | 'message'. Which face the card is showing when it arrives in
  -- a feed. Some reviews are the photo and some are the writing.
  add column if not exists card_side text;

alter table public.visits
  drop constraint if exists visits_card_orientation_check,
  drop constraint if exists visits_card_side_check;

alter table public.visits
  add constraint visits_card_orientation_check
    check (card_orientation is null or card_orientation in ('horizontal', 'vertical')),
  add constraint visits_card_side_check
    check (card_side is null or card_side in ('picture', 'message'));

comment on column public.visits.card_stock is
  'Which postcard sheet this review is printed on; null means derive from the id.';
comment on column public.visits.card_grain is
  'Which dust/scratch plate lies over the picture; null means derive from the id.';
comment on column public.visits.card_stamp is
  'Stamp design id, fixed at creation so later tag edits cannot change it.';
comment on column public.visits.card_orientation is
  'Author''s chosen card orientation; null means derive from the photos.';
comment on column public.visits.card_side is
  'Which face the card opens on; null means the picture side.';
