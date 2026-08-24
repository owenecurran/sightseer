-- Indexes on foreign keys that are actually joined on in hot paths.
--
-- Only the ones that matter: most unindexed FKs in this schema sit on
-- small or rarely-joined tables, where an index costs more to maintain
-- than it saves. These four are different --
--
--   travel_book_items.visit_id  -- joined for every item on a travel book
--                                  page, and by addTripToTravelBook's
--                                  "already in this book?" check.
--   travel_book_items.added_by  -- filtered when removing your own items.
--   travel_book_items.place_id  -- joined for place-type items.
--   comments.user_id            -- every comment thread resolves authors.
--
-- Currently trivial at this data size; all of them degrade to sequential
-- scans as the tables grow, and they are cheap to add now.
create index if not exists travel_book_items_visit_idx on public.travel_book_items (visit_id);
create index if not exists travel_book_items_added_by_idx on public.travel_book_items (added_by);
create index if not exists travel_book_items_place_idx on public.travel_book_items (place_id);
create index if not exists comments_user_idx on public.comments (user_id);
