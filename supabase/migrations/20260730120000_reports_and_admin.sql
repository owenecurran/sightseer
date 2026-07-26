-- No admin concept existed anywhere in this schema until now — a plain flag
-- is enough for a single-operator moderation setup; no self-service way to
-- become admin (set manually, e.g. via `supabase db query`).
alter table public.users add column is_admin boolean not null default false;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  reporter_id uuid not null references public.users (id) on delete cascade,
  reason text not null check (reason in ('spam', 'inappropriate', 'harassment', 'other')),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (visit_id, reporter_id)
);

create index reports_status_idx on public.reports (status, created_at);

alter table public.reports enable row level security;

-- Only the reporter themselves or an admin can see a given report — not the
-- reported visit's owner (no "who reported me" visibility), and not other
-- regular users.
create policy "reports_select" on public.reports
  for select using (
    auth.uid() = reporter_id
    or exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
  );

-- Can report anything you can see, as long as it's not your own visit.
create policy "reports_insert" on public.reports
  for insert with check (
    auth.uid() = reporter_id
    and exists (
      select 1 from public.visits v
      where v.id = visit_id
        and v.user_id <> auth.uid()
        and public.can_view_user_content(auth.uid(), v.user_id)
    )
  );

-- Only admins resolve/dismiss reports.
create policy "reports_update_admin" on public.reports
  for update using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin));

-- Additive (OR'd with the existing visits_select policy): admins need to see
-- reported content to moderate it, even from a private account they don't
-- follow — otherwise the review screen would be blind to exactly what it's
-- supposed to review. Deliberately not extended to photos in this pass;
-- moderation review is text-only for now (place/rating/note), not photos.
create policy "visits_select_admin" on public.visits
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin));
