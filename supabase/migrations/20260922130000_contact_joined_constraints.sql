-- Let a 'contact_joined' notification actually be inserted.
--
-- The previous migration added the type, the trigger and the index but not
-- this, and the omission was worse than a missing notification: the trigger
-- runs inside the UPDATE that sets a phone number, so a rejected insert
-- aborts that statement too. set_my_phone_hash would have failed outright —
-- with a constraint violation, not a warning — for anybody whose number was
-- already in somebody's contacts. Which is to say, for exactly the people
-- the feature is for.
--
-- Caught by exercising the trigger in a transaction that rolls back, rather
-- than by reading the migration again. Nothing in the first migration's own
-- text is wrong; what was wrong was two constraints it never mentioned.

-- The list of types that may exist at all.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'board_item_added',
    'travel_book_item_added',
    'board_saved',
    'travel_book_saved',
    'like',
    'comment',
    'follow',
    'friend_visit',
    'nearby_review_digest',
    'tagged',
    'friend_review_digest',
    'contact_joined'
  ]));

-- The shape rule: which of the optional foreign keys each type must and
-- must not carry.
--
-- contact_joined rides with 'follow' because it has the same shape — it is
-- about a person, so it carries an actor and nothing else. Reproduced in
-- full rather than patched, because a check constraint has no ALTER.
alter table public.notifications drop constraint if exists notifications_check;
alter table public.notifications add constraint notifications_check
  check (
    (type = 'board_item_added'
      and board_id is not null and board_item_id is not null
      and travel_book_id is null and travel_book_item_id is null and visit_id is null)
    or (type = 'travel_book_item_added'
      and travel_book_id is not null and travel_book_item_id is not null
      and board_id is null and board_item_id is null and visit_id is null)
    or (type = 'board_saved'
      and board_id is not null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null and visit_id is null)
    or (type = 'travel_book_saved'
      and travel_book_id is not null and travel_book_item_id is null
      and board_id is null and board_item_id is null and visit_id is null)
    or (type = any (array['like', 'comment', 'friend_visit', 'tagged'])
      and visit_id is not null
      and board_id is null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null)
    or (type = any (array['follow', 'contact_joined'])
      and visit_id is null and board_id is null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null)
    or (type = any (array['nearby_review_digest', 'friend_review_digest'])
      and visit_id is null and board_id is null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null)
  );
