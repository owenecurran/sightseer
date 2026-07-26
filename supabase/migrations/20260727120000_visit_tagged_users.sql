-- Credits other people on a visit ("@ocur with @david + 2 others" in the
-- mockup). No approval flow for v1 — tagging is immediate, like most apps'
-- baseline mention/tag behavior. A tagged user can always remove themselves.
-- Deliberately NOT extending visit/photo visibility to tagged users who
-- otherwise couldn't see the visit (e.g. a private owner they don't follow)
-- — kept the existing single visibility rule rather than special-casing it,
-- revisit only if that turns out to matter in practice.
create table public.visit_tagged_users (
  visit_id uuid not null references public.visits (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (visit_id, user_id)
);

alter table public.visit_tagged_users enable row level security;

create policy "visit_tagged_users_select" on public.visit_tagged_users
  for select using (
    exists (
      select 1 from public.visits v
      where v.id = visit_tagged_users.visit_id
        and public.can_view_user_content(auth.uid(), v.user_id)
    )
  );

create policy "visit_tagged_users_insert_own_visit" on public.visit_tagged_users
  for insert with check (
    exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid())
  );

create policy "visit_tagged_users_delete" on public.visit_tagged_users
  for delete using (
    auth.uid() = user_id
    or exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid())
  );
