-- Prevents saving the same item to the same board twice. Partial (not a
-- plain unique(board_id, item_type)) because exactly one of visit_id/photo_id/
-- place_id is set per row (enforced by the existing check constraint).
create unique index board_items_unique_visit
  on public.board_items (board_id, visit_id)
  where visit_id is not null;

create unique index board_items_unique_photo
  on public.board_items (board_id, photo_id)
  where photo_id is not null;

create unique index board_items_unique_place
  on public.board_items (board_id, place_id)
  where place_id is not null;
