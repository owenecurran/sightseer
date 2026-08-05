-- Batched mean-rating + save-count lookup for a set of boards/travel books,
-- one call per screen load rather than N. security definer, deviating from
-- get_place_aggregate_rating's invoker template: saved_boards_select_own/
-- saved_travel_books_select_own are auth.uid() = user_id only — nobody can
-- see "how many people saved board X" under invoker rights, the same
-- reasoning notify_board_savers already relies on. Re-derives
-- boards_select/travel_books_select's own visibility predicate inline so a
-- caller can't pull stats for a private board they can't see, and
-- re-applies can_view_user_content per-visit inside the rating subquery so
-- the average isn't skewed by a visit the caller couldn't otherwise see.
create or replace function public.get_collection_stats(
  board_ids uuid[] default '{}',
  travel_book_ids uuid[] default '{}'
)
returns table (collection_type text, collection_id uuid, avg_rating numeric, save_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    'board'::text as collection_type,
    b.id as collection_id,
    (
      select avg(v.rating)::numeric
      from public.board_items bi
      join public.visits v on v.id = bi.visit_id
      where bi.board_id = b.id
        and bi.item_type = 'visit'
        and public.can_view_user_content(auth.uid(), v.user_id)
    ) as avg_rating,
    (select count(*) from public.saved_boards sb where sb.board_id = b.id) as save_count
  from public.boards b
  where b.id = any(board_ids)
    and (b.user_id = auth.uid() or (b.is_private = false and public.can_view_user_content(auth.uid(), b.user_id)))

  union all

  select
    'travel_book'::text,
    tb.id,
    (
      select avg(v.rating)::numeric
      from public.travel_book_items ti
      join public.visits v on v.id = ti.visit_id
      where ti.travel_book_id = tb.id
        and ti.item_type = 'visit'
        and public.can_view_user_content(auth.uid(), v.user_id)
    ),
    (select count(*) from public.saved_travel_books stb where stb.travel_book_id = tb.id)
  from public.travel_books tb
  where tb.id = any(travel_book_ids)
    and (
      tb.user_id = auth.uid()
      or public.is_travel_book_participant(tb.id, auth.uid())
      or (tb.is_private = false and public.can_view_user_content(auth.uid(), tb.user_id))
    );
$$;

grant execute on function public.get_collection_stats(uuid[], uuid[]) to authenticated;
