-- Reports were visit-only until now (reports.visit_id, not null at first,
-- see 20260730120000/20260730120200) — no way to report a user directly
-- (e.g. from their profile, with no specific visit in view), and no
-- free-text field for the reporter to add context beyond the fixed reason
-- enum. Both are now first-class: reported_user_id is a real FK (not just a
-- snapshot string) since a user-direct report needs its own target, and
-- `details` is optional free text alongside the existing reason category.
alter table public.reports add column reported_user_id uuid references public.users (id) on delete set null;
alter table public.reports add column details text;

-- A report needs *something* to be about — either a visit, a user, or both
-- (e.g. reporting a user directly while a specific visit prompted it).
alter table public.reports add constraint reports_has_target
  check (visit_id is not null or reported_user_id is not null);

-- Prevents duplicate direct-user reports from the same reporter the same
-- way the existing (visit_id, reporter_id) unique constraint does for
-- visit reports — a plain unique constraint won't do this on its own since
-- Postgres treats every NULL as distinct, which is exactly what's wanted
-- for the *visit_id* side (many null-visit_id user reports from different
-- reporters must stay allowed) but not here.
create unique index reports_reporter_user_unique on public.reports (reporter_id, reported_user_id)
  where reported_user_id is not null;

-- Renamed from snapshot_report_visit — now snapshots whichever target(s)
-- the report actually has, not just a visit. `snapshot_author_name` is
-- reused as "who this report is about" either way (the visit's author, or
-- the directly-reported user), so moderation.tsx's existing display logic
-- keeps working unchanged for either report shape.
create or replace function public.snapshot_report_target() returns trigger as $$
begin
  if new.visit_id is not null then
    select p.name, coalesce(u.name, u.handle), v.rating, v.note
      into new.snapshot_place_name, new.snapshot_author_name, new.snapshot_rating, new.snapshot_note
    from public.visits v
    join public.places p on p.id = v.place_id
    join public.users u on u.id = v.user_id
    where v.id = new.visit_id;
  elsif new.reported_user_id is not null then
    select coalesce(u.name, u.handle) into new.snapshot_author_name
    from public.users u where u.id = new.reported_user_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger reports_snapshot_before_insert on public.reports;
create trigger reports_snapshot_before_insert
  before insert on public.reports
  for each row execute function public.snapshot_report_target();

drop function public.snapshot_report_visit();

-- Widened (OR'd) rather than replaced: a report can still be visit-only
-- (existing shape, unchanged condition) or now also user-direct — can't
-- report yourself, and can't report someone whose content you can't
-- otherwise see, same privacy rule the visit branch already applied.
drop policy "reports_insert" on public.reports;
create policy "reports_insert" on public.reports
  for insert with check (
    auth.uid() = reporter_id
    and (
      exists (
        select 1 from public.visits v
        where v.id = visit_id
          and v.user_id <> auth.uid()
          and public.can_view_user_content(auth.uid(), v.user_id)
      )
      or (
        reported_user_id is not null
        and reported_user_id <> auth.uid()
        and public.can_view_user_content(auth.uid(), reported_user_id)
      )
    )
  );
