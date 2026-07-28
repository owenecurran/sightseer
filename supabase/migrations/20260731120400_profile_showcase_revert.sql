-- "Favorite trip review" and "Next trip destination" are being folded into
-- the general profile_prompts system instead of living as dedicated fixed
-- sections (they're now just prompt options like any other, and none of the
-- profile prompts are required) — drops the columns and RLS check added in
-- 20260731120300_profile_showcase.sql, which are no longer used.
alter policy "users_update_own" on public.users
  with check (auth.uid() = id);

alter table public.users
  drop column featured_visit_id,
  drop column next_trip_destination;
