-- Index the foreign keys that had none.
--
-- Postgres indexes a PRIMARY KEY and a UNIQUE constraint for you. It does NOT
-- index a foreign key, and an unindexed FK costs in two places:
--
--   DELETES ON THE PARENT. Every `on delete cascade` has to find the children,
--     and with no index that is a sequential scan per child table. Deleting
--     one account currently scans client_errors, bug_reports, notifications,
--     saved_boards and travel_book_collaborators end to end. That is the path
--     an account-deletion request takes, so it is the one that must not be the
--     slowest thing in the system.
--
--   JOINS AND FILTERS. notifications.actor_id and board_items.visit_id are
--     read on screens people open constantly.
--
-- Columns already covered by a primary key or unique constraint whose LEADING
-- column they are — likes(visit_id, …), follows(follower_id, …) and the rest —
-- are deliberately absent: a second index there would be dead weight.
--
-- Plain CREATE INDEX rather than CONCURRENTLY, because the CLI runs a
-- migration inside a transaction and CONCURRENTLY cannot. At present table
-- sizes the write lock is momentary. If any of these tables is large by the
-- time this runs, pull that line out and do it CONCURRENTLY by hand.

create index if not exists articles_author_id_idx
  on public.articles (author_id);
create index if not exists blocks_blocked_id_idx
  on public.blocks (blocked_id);
create index if not exists board_item_checks_board_id_idx
  on public.board_item_checks (board_id);
create index if not exists board_item_checks_board_item_id_idx
  on public.board_item_checks (board_item_id);
create index if not exists board_items_photo_id_idx
  on public.board_items (photo_id);
create index if not exists board_items_place_id_idx
  on public.board_items (place_id);
create index if not exists board_items_visit_id_idx
  on public.board_items (visit_id);
create index if not exists bug_reports_user_id_idx
  on public.bug_reports (user_id);
create index if not exists client_errors_user_id_idx
  on public.client_errors (user_id);
create index if not exists draft_visits_place_id_idx
  on public.draft_visits (place_id);
create index if not exists home_locations_place_id_idx
  on public.home_locations (place_id);
create index if not exists landing_images_added_by_idx
  on public.landing_images (added_by);
create index if not exists landing_images_source_visit_id_idx
  on public.landing_images (source_visit_id);
create index if not exists notifications_actor_id_idx
  on public.notifications (actor_id);
create index if not exists notifications_board_id_idx
  on public.notifications (board_id);
create index if not exists notifications_board_item_id_idx
  on public.notifications (board_item_id);
create index if not exists notifications_travel_book_id_idx
  on public.notifications (travel_book_id);
create index if not exists notifications_travel_book_item_id_idx
  on public.notifications (travel_book_item_id);
create index if not exists profile_prompt_attachments_board_id_idx
  on public.profile_prompt_attachments (board_id);
create index if not exists profile_prompt_attachments_prompt_id_idx
  on public.profile_prompt_attachments (prompt_id);
create index if not exists profile_prompt_attachments_visit_id_idx
  on public.profile_prompt_attachments (visit_id);
create index if not exists profile_prompts_board_id_idx
  on public.profile_prompts (board_id);
create index if not exists profile_prompts_visit_id_idx
  on public.profile_prompts (visit_id);
create index if not exists travel_book_collaborators_user_id_idx
  on public.travel_book_collaborators (user_id);
create index if not exists travel_book_item_checks_travel_book_id_idx
  on public.travel_book_item_checks (travel_book_id);
create index if not exists travel_book_item_checks_travel_book_item_id_idx
  on public.travel_book_item_checks (travel_book_item_id);
create index if not exists travel_book_recaps_author_id_idx
  on public.travel_book_recaps (author_id);
create index if not exists trip_excluded_visits_visit_id_idx
  on public.trip_excluded_visits (visit_id);
create index if not exists trip_overrides_display_place_id_idx
  on public.trip_overrides (display_place_id);
create index if not exists trip_overrides_travel_book_id_idx
  on public.trip_overrides (travel_book_id);
create index if not exists visit_tagged_places_place_id_idx
  on public.visit_tagged_places (place_id);
