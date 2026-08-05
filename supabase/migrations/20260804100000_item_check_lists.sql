-- Personal, private checklists: a per-user "done" flag for a single item on
-- a board or travel book, for working through a saved collection. Distinct
-- from saved_boards/saved_travel_books (that's "I'm following this
-- collection"; this is a private progress marker, never surfaced to the
-- collection's owner or anyone else). board_id/travel_book_id are
-- denormalized alongside the item id (same shape notifications takes with
-- board_id + board_item_id) so "my checked items for this board" is a
-- single indexed lookup with no join through board_items needed.
create table public.board_item_checks (
  user_id uuid not null references public.users (id) on delete cascade,
  board_item_id uuid not null references public.board_items (id) on delete cascade,
  board_id uuid not null references public.boards (id) on delete cascade,
  checked_at timestamptz not null default now(),
  primary key (user_id, board_item_id)
);
create index board_item_checks_user_board_idx on public.board_item_checks (user_id, board_id);

create table public.travel_book_item_checks (
  user_id uuid not null references public.users (id) on delete cascade,
  travel_book_item_id uuid not null references public.travel_book_items (id) on delete cascade,
  travel_book_id uuid not null references public.travel_books (id) on delete cascade,
  checked_at timestamptz not null default now(),
  primary key (user_id, travel_book_item_id)
);
create index travel_book_item_checks_user_board_idx on public.travel_book_item_checks (user_id, travel_book_id);

alter table public.board_item_checks enable row level security;
alter table public.travel_book_item_checks enable row level security;

-- Fully owned by the checker; no select policy grants visibility to anyone
-- else, including the board owner. Insert requires the item to actually
-- belong to the named board, the board to be visible per the standard
-- visibility rule, and the checker to either own the board or have already
-- saved it (matches the feature's own framing: "save someone else's board,
-- and check them off") -- same defense-in-depth shape as
-- saved_boards_insert_own. No update policy: toggling is insert/delete only.
create policy "board_item_checks_select_own" on public.board_item_checks
  for select using (auth.uid() = user_id);

create policy "board_item_checks_insert_own" on public.board_item_checks
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.board_items bi where bi.id = board_item_id and bi.board_id = board_id)
    and exists (
      select 1 from public.boards b where b.id = board_id
        and (b.user_id = auth.uid() or (b.is_private = false and public.can_view_user_content(auth.uid(), b.user_id)))
    )
    and (
      exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
      or exists (select 1 from public.saved_boards sb where sb.board_id = board_id and sb.user_id = auth.uid())
    )
  );

create policy "board_item_checks_delete_own" on public.board_item_checks
  for delete using (auth.uid() = user_id);

-- travel_book_item_checks: same shape, using is_travel_book_participant for
-- the owner/collaborator branch instead of a plain user_id match.
create policy "travel_book_item_checks_select_own" on public.travel_book_item_checks
  for select using (auth.uid() = user_id);

create policy "travel_book_item_checks_insert_own" on public.travel_book_item_checks
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.travel_book_items ti where ti.id = travel_book_item_id and ti.travel_book_id = travel_book_id
    )
    and exists (
      select 1 from public.travel_books tb where tb.id = travel_book_id
        and (
          tb.user_id = auth.uid()
          or public.is_travel_book_participant(tb.id, auth.uid())
          or (tb.is_private = false and public.can_view_user_content(auth.uid(), tb.user_id))
        )
    )
    and (
      public.is_travel_book_participant(travel_book_id, auth.uid())
      or exists (
        select 1 from public.saved_travel_books stb where stb.travel_book_id = travel_book_id and stb.user_id = auth.uid()
      )
    )
  );

create policy "travel_book_item_checks_delete_own" on public.travel_book_item_checks
  for delete using (auth.uid() = user_id);
