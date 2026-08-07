-- Drafts get their own table rather than a nullable/status-flagged `visits`
-- row: visits.place_id is `not null` and joined as non-null across dozens
-- of existing files (feed, boards, travel books, tagging, reports, search,
-- moderation, showcase). Widening it would mean adding an explicit
-- status='published' filter to every one of those queries — one missed
-- spot is a private-draft leak. A separate table is invisible to all of
-- that surface by construction.
create table public.draft_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  place_id uuid references public.places (id) on delete restrict,
  rating smallint check (rating between 1 and 5),
  note text,
  visited_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index draft_visits_user_idx on public.draft_visits (user_id, created_at desc);

alter table public.draft_visits enable row level security;

-- Always private — no can_view_user_content branch, ever. Nobody but the
-- owner ever sees a draft.
create policy "draft_visits_select_own" on public.draft_visits
  for select using (auth.uid() = user_id);

create policy "draft_visits_insert_own" on public.draft_visits
  for insert with check (auth.uid() = user_id);

create policy "draft_visits_update_own" on public.draft_visits
  for update using (auth.uid() = user_id);

create policy "draft_visits_delete_own" on public.draft_visits
  for delete using (auth.uid() = user_id);

-- Reuses set_updated_at() from 20260804110000_board_travel_book_updated_at.sql.
create trigger draft_visits_set_updated_at
  before update on public.draft_visits
  for each row execute function public.set_updated_at();

-- =========================================================================
-- photos: now optionally parented by a draft instead of a real visit.
-- Publishing a draft is a cheap UPDATE of visit_id (see publish_draft() in
-- the next migration), never an R2 object move, since r2_key already IS
-- the object location.
-- =========================================================================
alter table public.photos alter column visit_id drop not null;
alter table public.photos add column draft_visit_id uuid references public.draft_visits (id) on delete cascade;

alter table public.photos add constraint photos_exactly_one_parent
  check (
    (visit_id is not null and draft_visit_id is null)
    or (visit_id is null and draft_visit_id is not null)
  );

create index photos_draft_visit_idx on public.photos (draft_visit_id, position);

drop policy "photos_select" on public.photos;
create policy "photos_select" on public.photos
  for select using (
    (visit_id is not null and exists (
      select 1 from public.visits v
      where v.id = photos.visit_id
        and public.can_view_user_content(auth.uid(), v.user_id)
    ))
    or (draft_visit_id is not null and exists (
      select 1 from public.draft_visits d
      where d.id = photos.draft_visit_id and d.user_id = auth.uid()
    ))
  );

drop policy "photos_insert_own" on public.photos;
create policy "photos_insert_own" on public.photos
  for insert with check (
    (visit_id is not null and exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid()))
    or (draft_visit_id is not null and exists (select 1 from public.draft_visits d where d.id = draft_visit_id and d.user_id = auth.uid()))
  );

drop policy "photos_delete_own" on public.photos;
create policy "photos_delete_own" on public.photos
  for delete using (
    (visit_id is not null and exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid()))
    or (draft_visit_id is not null and exists (select 1 from public.draft_visits d where d.id = draft_visit_id and d.user_id = auth.uid()))
  );
-- No photos_update policy: the visit_id/draft_visit_id re-point only ever
-- happens inside publish_draft(), which is security definer.
