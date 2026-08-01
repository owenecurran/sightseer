-- travel_book_recaps.rating was created matching the app's old 1-5 rating
-- scale, but visits.rating has used a 0-10 numeric(3,1) scale since
-- 20260724120000_rating_decimal_scale.sql (RatingSlider, the component this
-- recap form reuses, is already built for 0-10). Correcting before any real
-- data exists in this brand-new table.
alter table public.travel_book_recaps drop constraint travel_book_recaps_rating_check;
alter table public.travel_book_recaps alter column rating type numeric(3, 1) using rating::numeric(3, 1);
alter table public.travel_book_recaps add constraint travel_book_recaps_rating_check check (rating >= 0 and rating <= 10);
