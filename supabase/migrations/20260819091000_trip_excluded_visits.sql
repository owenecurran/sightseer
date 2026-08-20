-- "That review wasn't part of this trip."
--
-- Keyed by (user_id, visit_id) rather than by trip, deliberately. Keying it
-- to a trip anchor would be circular: clustering decides which trip a review
-- belongs to, but the exclusion has to apply BEFORE clustering runs or the
-- trip's dates and label are still computed from the review you removed.
-- Excluding an airport layover should shorten the trip AND stop it being
-- named after the wrong country — both fall out for free this way. A visit
-- belongs to at most one trip (clusters never overlap), so nothing is lost.
--
-- Also survives new reviews arriving: exclusion is a property of the review
-- itself, so a later review nearby can't silently drag an excluded one back
-- in.
create table public.trip_excluded_visits (
  user_id uuid not null references public.users (id) on delete cascade,
  visit_id uuid not null references public.visits (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, visit_id)
);
create index trip_excluded_visits_user_idx on public.trip_excluded_visits (user_id);

alter table public.trip_excluded_visits enable row level security;

-- Readable by anyone who can see this user's content, so a trip looks the
-- same to everyone; writable only by its owner.
create policy "trip_excluded_visits_select" on public.trip_excluded_visits
  for select using (public.can_view_user_content(auth.uid(), user_id));
create policy "trip_excluded_visits_insert_own" on public.trip_excluded_visits
  for insert with check (auth.uid() = user_id);
create policy "trip_excluded_visits_delete_own" on public.trip_excluded_visits
  for delete using (auth.uid() = user_id);
