-- Deleting a reported visit (the main moderation action) previously cascaded
-- and destroyed the report row along with it, so "resolved" never actually
-- persisted — the report just vanished, leaving no audit trail. Switch the
-- FK to SET NULL and snapshot the visit's details at report time so a
-- resolved report still shows what it was about after the visit is gone.
alter table public.reports drop constraint reports_visit_id_fkey;
alter table public.reports alter column visit_id drop not null;
alter table public.reports add constraint reports_visit_id_fkey
  foreign key (visit_id) references public.visits (id) on delete set null;

alter table public.reports add column snapshot_place_name text;
alter table public.reports add column snapshot_author_name text;
alter table public.reports add column snapshot_rating numeric(3, 1);
alter table public.reports add column snapshot_note text;

-- Populated once, at insert time, from the reported visit — not kept in
-- sync afterward (a snapshot is meant to freeze what was reported, not
-- track live edits).
create function public.snapshot_report_visit() returns trigger as $$
begin
  select p.name, coalesce(u.name, u.handle), v.rating, v.note
    into new.snapshot_place_name, new.snapshot_author_name, new.snapshot_rating, new.snapshot_note
  from public.visits v
  join public.places p on p.id = v.place_id
  join public.users u on u.id = v.user_id
  where v.id = new.visit_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger reports_snapshot_before_insert
  before insert on public.reports
  for each row execute function public.snapshot_report_visit();
