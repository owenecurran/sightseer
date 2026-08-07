-- First admin-authored-content table in this schema (every existing admin
-- capability is moderation of *existing* user content, never creating new
-- rows) — author_id, not user_id, since this isn't per-user ownership.
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users (id) on delete restrict,
  title text not null,
  subtitle text,
  body text not null,
  cover_photo_r2_key text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index articles_published_idx on public.articles (published_at desc);

alter table public.articles enable row level security;

-- Anyone can read a published article; admins can also read drafts (to
-- preview before publishing).
create policy "articles_select" on public.articles
  for select using (
    published_at is not null
    or exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
  );

-- Same repeated is_admin-subquery shape as visits_delete_admin/
-- reports_update_admin — admin-only insert/update/delete, full-row (not
-- column-scoped), matching this codebase's existing admin-trust model.
create policy "articles_insert_admin" on public.articles
  for insert with check (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin));
create policy "articles_update_admin" on public.articles
  for update using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin));
create policy "articles_delete_admin" on public.articles
  for delete using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin));

-- Reuses set_updated_at() from 20260804110000_board_travel_book_updated_at.sql.
create trigger articles_set_updated_at before update on public.articles
  for each row execute function public.set_updated_at();

-- Featured boards: admin-curated, surfaced on the Discover tab.
alter table public.boards add column is_featured boolean not null default false;

create policy "boards_update_admin" on public.boards
  for update using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin));

-- "Seen before" feed divider: one timestamp, not per-post read tracking —
-- bumped to now() each time the Feed loads, compared against each item's
-- own created_at/published_at to find where "already seen" begins.
alter table public.users add column feed_last_viewed_at timestamptz;
