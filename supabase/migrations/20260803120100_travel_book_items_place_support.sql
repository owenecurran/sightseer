-- Widens travel_book_items to allow a bare place (no review/visit required),
-- mirroring board_items' existing item_type polymorphism. Additive and safe
-- against live data: every existing row already has a non-null visit_id, and
-- `default 'visit'` makes them all correctly typed automatically — no
-- backfill pass needed.
alter table public.travel_book_items add column item_type text not null default 'visit'
  check (item_type in ('visit', 'place'));
alter table public.travel_book_items alter column visit_id drop not null;
alter table public.travel_book_items add column place_id uuid references public.places (id) on delete cascade;
alter table public.travel_book_items add constraint travel_book_items_item_shape check (
  (item_type = 'visit' and visit_id is not null and place_id is null)
  or (item_type = 'place' and place_id is not null and visit_id is null)
);

-- The existing unique(travel_book_id, visit_id) stays as-is — a null
-- visit_id never conflicts under a plain unique index in Postgres, so
-- 'place' rows are unaffected by it. Separate partial index for 'place' rows.
create unique index travel_book_items_unique_place on public.travel_book_items (travel_book_id, place_id)
  where place_id is not null;

-- Re-create select/insert policies with an item_type branch, same shape as
-- board_items_select/board_items_insert_own's existing 'place' branch: a
-- bare place item is visible/insertable whenever the book itself is, with no
-- further per-item eligibility check (there's no visit to check ownership
-- of).
drop policy "travel_book_items_select" on public.travel_book_items;
create policy "travel_book_items_select" on public.travel_book_items
  for select using (
    exists (
      select 1 from public.travel_books tb
      where tb.id = travel_book_items.travel_book_id
        and (
          tb.user_id = auth.uid()
          or exists (
            select 1 from public.travel_book_collaborators c
            where c.travel_book_id = tb.id and c.user_id = auth.uid()
          )
          or (tb.is_private = false and public.can_view_user_content(auth.uid(), tb.user_id))
        )
    )
    and (
      (item_type = 'place')
      or (item_type = 'visit' and exists (
        select 1 from public.visits v
        where v.id = travel_book_items.visit_id and public.can_view_user_content(auth.uid(), v.user_id)
      ))
    )
  );

drop policy "travel_book_items_insert" on public.travel_book_items;
create policy "travel_book_items_insert" on public.travel_book_items
  for insert with check (
    public.is_travel_book_participant(travel_book_id, auth.uid())
    and added_by = auth.uid()
    and (
      (item_type = 'place')
      or (item_type = 'visit' and exists (
        select 1 from public.visits v
        where v.id = visit_id
          and (
            v.user_id = auth.uid()
            or exists (
              select 1 from public.visit_tagged_users t
              where t.visit_id = v.id and t.user_id = auth.uid()
            )
          )
      ))
    )
  );
