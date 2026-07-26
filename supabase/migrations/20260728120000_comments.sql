create table public.comments (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index comments_visit_idx on public.comments (visit_id, created_at);

alter table public.comments enable row level security;

create policy "comments_select" on public.comments
  for select using (
    exists (
      select 1 from public.visits v
      where v.id = comments.visit_id
        and public.can_view_user_content(auth.uid(), v.user_id)
    )
  );

create policy "comments_insert" on public.comments
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.visits v
      where v.id = visit_id
        and public.can_view_user_content(auth.uid(), v.user_id)
    )
  );

-- Either the commenter or the visit's owner can remove a comment (basic
-- moderation on your own post) — no edit support for v1.
create policy "comments_delete" on public.comments
  for delete using (
    auth.uid() = user_id
    or exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid())
  );
