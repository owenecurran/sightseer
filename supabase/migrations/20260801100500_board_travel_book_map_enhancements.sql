-- item 6: pick an existing item photo as a board/travel-book's cover
alter table public.boards add column cover_photo_id uuid references public.photos (id) on delete set null;
alter table public.travel_books add column cover_photo_id uuid references public.photos (id) on delete set null;

-- item 4: optional real place (via the existing places cache) for a trip's broad location
alter table public.travel_books add column location_place_id uuid references public.places (id) on delete set null;

-- item 14: locked profile-map starting camera (nullable = "not locked, use auto-centroid")
alter table public.users add column map_default_center_lat double precision;
alter table public.users add column map_default_center_lng double precision;
alter table public.users add column map_default_zoom real;
