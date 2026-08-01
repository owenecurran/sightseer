-- A travel book's own publishable write-up about the trip as a whole,
-- distinct from the individual place reviews inside it. Kept as its own
-- table rather than columns on travel_books so a future multi-recap /
-- edit-history model doesn't require another migration — v1 app logic
-- treats this as a single mutable row per book (no unique constraint
-- enforced here on purpose, to leave that room).
create table public.travel_book_recaps (
  id uuid primary key default gen_random_uuid(),
  travel_book_id uuid not null references public.travel_books (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  body text,
  rating smallint check (rating between 1 and 5),
  cover_r2_key text,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index travel_book_recaps_book_idx on public.travel_book_recaps (travel_book_id);

-- Powers the feed's "published recaps from people I follow" query.
create index travel_book_recaps_published_idx on public.travel_book_recaps (published_at desc)
  where is_published = true;

alter table public.travel_book_recaps enable row level security;

-- Owner-only authorship in v1 (collaborators can add visits to the book,
-- but the trip-level recap write-up stays single-author) — the dedicated
-- table above is what leaves room to relax this later.
create policy "travel_book_recaps_select" on public.travel_book_recaps
  for select using (
    author_id = auth.uid()
    or (
      is_published = true
      and exists (
        select 1 from public.travel_books tb
        where tb.id = travel_book_id
          and (
            tb.user_id = auth.uid()
            or public.is_travel_book_participant(tb.id, auth.uid())
            or (tb.is_private = false and public.can_view_user_content(auth.uid(), tb.user_id))
          )
      )
    )
  );

create policy "travel_book_recaps_insert_owner" on public.travel_book_recaps
  for insert with check (
    author_id = auth.uid()
    and exists (select 1 from public.travel_books tb where tb.id = travel_book_id and tb.user_id = auth.uid())
  );

create policy "travel_book_recaps_update_owner" on public.travel_book_recaps
  for update using (
    exists (select 1 from public.travel_books tb where tb.id = travel_book_id and tb.user_id = auth.uid())
  );

create policy "travel_book_recaps_delete_owner" on public.travel_book_recaps
  for delete using (
    exists (select 1 from public.travel_books tb where tb.id = travel_book_id and tb.user_id = auth.uid())
  );
