-- Favorite trip review (user-selected featured visit) and a free-text
-- "next trip destination" for the profile redesign.
alter table public.users
  add column featured_visit_id uuid references public.visits (id) on delete set null,
  add column next_trip_destination text check (char_length(next_trip_destination) <= 80);

-- Ownership check on featured_visit_id, same "RLS visibility isn't
-- ownership" double-check pattern already used for
-- profile_prompt_attachments.visit_id/board_id.
alter policy "users_update_own" on public.users
  with check (
    auth.uid() = id
    and (
      featured_visit_id is null
      or exists (
        select 1 from public.visits v where v.id = featured_visit_id and v.user_id = auth.uid()
      )
    )
  );
