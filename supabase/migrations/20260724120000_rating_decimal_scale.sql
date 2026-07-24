-- Ratings move from 1-5 integer stars to a 0-10 decimal scale (e.g. 9.7),
-- driven by a slider UI rather than a star picker.
alter table public.visits drop constraint visits_rating_check;
alter table public.visits alter column rating type numeric(3, 1) using rating::numeric(3, 1);
alter table public.visits add constraint visits_rating_check check (rating >= 0 and rating <= 10);
