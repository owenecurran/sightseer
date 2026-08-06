-- Widens notifications for real-time (like/comment/follow/board_saved/
-- travel_book_saved/friend_visit) and digest (nearby_review_digest) event
-- types. visit_id is new — likes/comments/friend-posted-visits all target
-- exactly one visit, same shape as board_id+board_item_id for board events.
-- digest_place_ids/digest_review_count are new — a plain array beats a
-- junction table here: this is a write-once, read-only summary row with no
-- drill-down screen in scope, and places rows are never hard-deleted
-- anywhere in this schema, so there's no dangling-id risk to guard against.
alter table public.notifications
  add column visit_id uuid references public.visits (id) on delete cascade,
  add column digest_place_ids uuid[],
  add column digest_review_count integer;

alter table public.notifications
  drop constraint notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'board_item_added', 'travel_book_item_added', 'board_saved', 'travel_book_saved',
      'like', 'comment', 'follow', 'friend_visit', 'nearby_review_digest'
    )
  );

alter table public.notifications
  drop constraint notifications_check;

alter table public.notifications
  add constraint notifications_check check (
    (type = 'board_item_added' and board_id is not null and board_item_id is not null
       and travel_book_id is null and travel_book_item_id is null and visit_id is null
       and digest_place_ids is null and digest_review_count is null)
    or (type = 'travel_book_item_added' and travel_book_id is not null and travel_book_item_id is not null
       and board_id is null and board_item_id is null and visit_id is null
       and digest_place_ids is null and digest_review_count is null)
    or (type = 'board_saved' and board_id is not null and board_item_id is null
       and travel_book_id is null and travel_book_item_id is null and visit_id is null
       and digest_place_ids is null and digest_review_count is null)
    or (type = 'travel_book_saved' and travel_book_id is not null and travel_book_item_id is null
       and board_id is null and board_item_id is null and visit_id is null
       and digest_place_ids is null and digest_review_count is null)
    or (type in ('like', 'comment', 'friend_visit') and visit_id is not null
       and board_id is null and board_item_id is null and travel_book_id is null and travel_book_item_id is null
       and digest_place_ids is null and digest_review_count is null)
    or (type = 'follow' and visit_id is null
       and board_id is null and board_item_id is null and travel_book_id is null and travel_book_item_id is null
       and digest_place_ids is null and digest_review_count is null)
    or (type = 'nearby_review_digest' and actor_id is null and visit_id is null
       and board_id is null and board_item_id is null and travel_book_id is null and travel_book_item_id is null
       and digest_place_ids is not null and array_length(digest_place_ids, 1) > 0
       and digest_review_count is not null and digest_review_count > 0)
  );

create index notifications_visit_idx on public.notifications (visit_id) where visit_id is not null;
