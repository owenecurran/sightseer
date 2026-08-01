-- Travel books: chronological, multi-contributor trip journals. Separate
-- from boards (boards stay a Pinterest-style personal saved-collection
-- feature) — a travel book can only hold visits owned by, or tagged to,
-- its own owner/collaborators, modeling "everyone's reviews from this trip"
-- rather than an arbitrary save-anything collection.
create table public.travel_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  description text,
  cover_r2_key text,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);
create index travel_books_user_idx on public.travel_books (user_id);

-- Explicit trip roster, populated only by the book owner inviting people.
-- Deliberately NOT auto-derived from visit_tagged_users on individual
-- visits — being tagged in one photo shouldn't silently make you a
-- co-editor of someone else's whole trip.
create table public.travel_book_collaborators (
  travel_book_id uuid not null references public.travel_books (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (travel_book_id, user_id)
);

create table public.travel_book_items (
  id uuid primary key default gen_random_uuid(),
  travel_book_id uuid not null references public.travel_books (id) on delete cascade,
  visit_id uuid not null references public.visits (id) on delete cascade,
  added_by uuid not null references public.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (travel_book_id, visit_id)
);
create index travel_book_items_book_idx on public.travel_book_items (travel_book_id);

-- security definer + fixed search_path, same reasoning as can_view_user_content:
-- lets travel_book_collaborators' own select policy check participation
-- without recursing into its own RLS.
create function public.is_travel_book_participant(book_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.travel_books tb where tb.id = book_id and tb.user_id = uid)
      or exists (select 1 from public.travel_book_collaborators c where c.travel_book_id = book_id and c.user_id = uid);
$$;

alter table public.travel_books enable row level security;
alter table public.travel_book_collaborators enable row level security;
alter table public.travel_book_items enable row level security;

-- travel_books: same privacy-flag + follow-status rule as boards, plus
-- collaborators can always see a book they've been added to regardless
-- of its privacy flag or the owner's follow relationship to the viewer.
create policy "travel_books_select" on public.travel_books
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.travel_book_collaborators c
      where c.travel_book_id = id and c.user_id = auth.uid()
    )
    or (is_private = false and public.can_view_user_content(auth.uid(), user_id))
  );

create policy "travel_books_insert_own" on public.travel_books
  for insert with check (auth.uid() = user_id);

create policy "travel_books_update_own" on public.travel_books
  for update using (auth.uid() = user_id);

create policy "travel_books_delete_own" on public.travel_books
  for delete using (auth.uid() = user_id);

-- travel_book_collaborators: only the book owner invites; a collaborator
-- can remove themselves (same self-removal shape as visit_tagged_users),
-- and the owner can remove anyone.
create policy "travel_book_collaborators_select" on public.travel_book_collaborators
  for select using (public.is_travel_book_participant(travel_book_id, auth.uid()));

create policy "travel_book_collaborators_insert_owner" on public.travel_book_collaborators
  for insert with check (
    exists (select 1 from public.travel_books tb where tb.id = travel_book_id and tb.user_id = auth.uid())
  );

create policy "travel_book_collaborators_delete" on public.travel_book_collaborators
  for delete using (
    auth.uid() = user_id
    or exists (select 1 from public.travel_books tb where tb.id = travel_book_id and tb.user_id = auth.uid())
  );

-- travel_book_items: visible only if BOTH the book is visible to the viewer
-- AND the underlying visit is independently visible (checked live, same
-- "tagging/membership doesn't extend visibility" rule as visit_tagged_users
-- and board_items).
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
    and exists (
      select 1 from public.visits v
      where v.id = travel_book_items.visit_id and public.can_view_user_content(auth.uid(), v.user_id)
    )
  );

-- Insert-time eligibility: the actor must be a participant (owner or
-- collaborator) on the book, AND the visit they're adding must be their
-- own eligible visit — one they own, or one they're tagged in.
create policy "travel_book_items_insert" on public.travel_book_items
  for insert with check (
    public.is_travel_book_participant(travel_book_id, auth.uid())
    and added_by = auth.uid()
    and exists (
      select 1 from public.visits v
      where v.id = visit_id
        and (
          v.user_id = auth.uid()
          or exists (
            select 1 from public.visit_tagged_users t
            where t.visit_id = v.id and t.user_id = auth.uid()
          )
        )
    )
  );

create policy "travel_book_items_delete" on public.travel_book_items
  for delete using (
    auth.uid() = added_by
    or exists (select 1 from public.travel_books tb where tb.id = travel_book_id and tb.user_id = auth.uid())
  );
