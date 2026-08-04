-- Saved boards/travel books: lets a user bookmark someone else's board or
-- travel book into their own collection, with a per-save opt-in toggle for
-- whether new items added to it should generate a notification. Separate
-- from `boards`/`travel_books` ownership entirely — this is a one-way
-- "I'm following this collection" relationship, not a copy.
create table public.saved_boards (
  user_id uuid not null references public.users (id) on delete cascade,
  board_id uuid not null references public.boards (id) on delete cascade,
  notify_on_new_items boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, board_id)
);
create index saved_boards_board_idx on public.saved_boards (board_id);

create table public.saved_travel_books (
  user_id uuid not null references public.users (id) on delete cascade,
  travel_book_id uuid not null references public.travel_books (id) on delete cascade,
  notify_on_new_items boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, travel_book_id)
);
create index saved_travel_books_book_idx on public.saved_travel_books (travel_book_id);

-- Generic in-app notification feed. Typed nullable FK columns + a check
-- constraint (same shape as board_items.item_type) rather than a jsonb
-- payload, matching this project's established preference for explicit
-- columns over open-ended blobs for events that already have a known shape
-- (see notify_likes/notify_comments/notify_follows on users). Adding a new
-- event type later is one more nullable-FK column set + one more check
-- branch, same pattern board_items itself already uses.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users (id) on delete cascade,
  actor_id uuid references public.users (id) on delete set null,
  type text not null check (type in ('board_item_added', 'travel_book_item_added')),
  board_id uuid references public.boards (id) on delete cascade,
  board_item_id uuid references public.board_items (id) on delete cascade,
  travel_book_id uuid references public.travel_books (id) on delete cascade,
  travel_book_item_id uuid references public.travel_book_items (id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  check (
    (type = 'board_item_added' and board_id is not null and board_item_id is not null
       and travel_book_id is null and travel_book_item_id is null)
    or (type = 'travel_book_item_added' and travel_book_id is not null and travel_book_item_id is not null
       and board_id is null and board_item_id is null)
  )
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

alter table public.saved_boards enable row level security;
alter table public.saved_travel_books enable row level security;
alter table public.notifications enable row level security;

-- saved_boards: fully owned by the saver. Insert requires the target board
-- to actually be visible to them (own board or a visible public/followed
-- one) — same visibility rule board_items_select already uses for boards.
create policy "saved_boards_select_own" on public.saved_boards
  for select using (auth.uid() = user_id);

create policy "saved_boards_insert_own" on public.saved_boards
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.boards b where b.id = board_id
        and (b.user_id = auth.uid() or (b.is_private = false and public.can_view_user_content(auth.uid(), b.user_id)))
    )
  );

create policy "saved_boards_update_own" on public.saved_boards
  for update using (auth.uid() = user_id);

create policy "saved_boards_delete_own" on public.saved_boards
  for delete using (auth.uid() = user_id);

-- saved_travel_books: same shape, using is_travel_book_participant's own
-- visibility rule (owner, collaborator, or visible public/followed book).
create policy "saved_travel_books_select_own" on public.saved_travel_books
  for select using (auth.uid() = user_id);

create policy "saved_travel_books_insert_own" on public.saved_travel_books
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.travel_books tb where tb.id = travel_book_id
        and (
          tb.user_id = auth.uid()
          or public.is_travel_book_participant(tb.id, auth.uid())
          or (tb.is_private = false and public.can_view_user_content(auth.uid(), tb.user_id))
        )
    )
  );

create policy "saved_travel_books_update_own" on public.saved_travel_books
  for update using (auth.uid() = user_id);

create policy "saved_travel_books_delete_own" on public.saved_travel_books
  for delete using (auth.uid() = user_id);

-- notifications: recipients can read and mark-read their own rows.
-- Deliberately NO insert policy for `authenticated` — rows are only ever
-- created by the security-definer trigger functions below, same reasoning
-- as is_travel_book_participant/upgrade_place_details: nobody should be
-- able to write a fake notification to themselves or anyone else directly.
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = recipient_id);

create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

-- Fan-out: whenever an item is added to a board, notify everyone who saved
-- that board with notify_on_new_items = true (except the board owner
-- themselves — they always know, since board_items can only ever be
-- inserted by the board owner per board_items_insert_own).
create function public.notify_board_savers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, board_id, board_item_id)
  select sb.user_id, b.user_id, 'board_item_added', new.board_id, new.id
  from public.saved_boards sb
  join public.boards b on b.id = new.board_id
  where sb.board_id = new.board_id
    and sb.notify_on_new_items = true
    and sb.user_id <> b.user_id;
  return new;
end;
$$;

create trigger board_items_notify_savers
  after insert on public.board_items
  for each row execute function public.notify_board_savers();

-- Same fan-out for travel books. Unlike boards, travel_book_items already
-- has its own added_by column (any participant, not just the owner, can add
-- an item) — used directly as the notification's actor_id instead of
-- re-deriving the book owner.
create function public.notify_travel_book_savers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, travel_book_id, travel_book_item_id)
  select stb.user_id, new.added_by, 'travel_book_item_added', new.travel_book_id, new.id
  from public.saved_travel_books stb
  where stb.travel_book_id = new.travel_book_id
    and stb.notify_on_new_items = true
    and stb.user_id <> new.added_by;
  return new;
end;
$$;

create trigger travel_book_items_notify_savers
  after insert on public.travel_book_items
  for each row execute function public.notify_travel_book_savers();
