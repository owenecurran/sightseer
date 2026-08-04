-- A single, editable-any-time rating for the travel book itself — distinct
-- from travel_book_recaps.rating, which belongs to a separate "trip recap"
-- write-up concept, not the book as a whole. Nullable with no default:
-- "unset" is a valid state, not 0. Same 0-10 scale as visits.rating
-- (20260724120000_rating_decimal_scale.sql), reusing the existing
-- RatingSlider component client-side.
alter table public.travel_books add column rating numeric(3,1) check (rating >= 0 and rating <= 10);

-- Pure UI-framing flag for boards: which view a board opens to / whether its
-- card gets numbered-rank styling. Not a mechanism in itself — ranking is
-- driven entirely by board_items.position, which already exists.
alter table public.boards add column list_style text not null default 'collection'
  check (list_style in ('collection', 'ranked'));
