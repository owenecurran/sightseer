-- Incremental harmony refresh: work proportional to what actually changed.
--
-- A blind nightly sweep recomputes every user whether or not anything about
-- them moved. At 440ms each that is ~7 minutes of continuous database work
-- per thousand users, almost all of it recomputing identical numbers.
--
-- Instead, changes ENQUEUE the affected user and a scheduled job drains the
-- queue in bounded batches. A quiet week costs nothing; a busy day costs
-- exactly as much as it should, spread across runs.
--
-- Only the acting user is enqueued, not their counterparts: harmony rows are
-- stored once under a canonical ordering, so recomputing one side rewrites
-- the shared row. If both people are active, both enqueue, and the row is
-- simply written twice with the same result.
create table public.harmony_refresh_queue (
  user_id uuid primary key references public.users (id) on delete cascade,
  queued_at timestamptz not null default now()
);

-- Drained oldest-first so nobody can be starved by a busy neighbour.
create index harmony_refresh_queue_age_idx on public.harmony_refresh_queue (queued_at);

alter table public.harmony_refresh_queue enable row level security;
-- No client ever touches this directly; the triggers and the cron job are
-- both security definer. No policies == no access, which is the intent.

create or replace function public.enqueue_harmony_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  target uuid;
begin
  target := coalesce(new.user_id, old.user_id);
  if target is not null then
    insert into public.harmony_refresh_queue (user_id)
    values (target)
    on conflict (user_id) do nothing;
  end if;
  return null;
end;
$fn$;

-- The three things that can change somebody's harmony: what they reviewed,
-- where they call home (which decides what counts as travel), and which
-- reviews they excluded from trips.
create trigger visits_enqueue_harmony
  after insert or update or delete on public.visits
  for each row execute function public.enqueue_harmony_refresh();

create trigger home_locations_enqueue_harmony
  after insert or update or delete on public.home_locations
  for each row execute function public.enqueue_harmony_refresh();

create trigger trip_excluded_enqueue_harmony
  after insert or update or delete on public.trip_excluded_visits
  for each row execute function public.enqueue_harmony_refresh();

-- Processes a bounded slice of the queue. Bounded on purpose: a run that
-- cannot finish is worse than one that leaves work for the next tick.
create or replace function public.drain_harmony_refresh_queue(batch_limit int default 25)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  target record;
  processed int := 0;
begin
  for target in
    select user_id from public.harmony_refresh_queue
    order by queued_at
    limit batch_limit
    -- Skips rows another run already holds, so overlapping ticks cooperate
    -- instead of doing the same user twice.
    for update skip locked
  loop
    begin
      perform public.refresh_harmony_for_user(target.user_id);
      delete from public.harmony_refresh_queue where user_id = target.user_id;
      processed := processed + 1;
    exception when others then
      -- One user failing must not abandon the rest of the batch. Their row
      -- stays queued and is retried on the next tick.
      null;
    end;
  end loop;
  return processed;
end;
$fn$;

grant execute on function public.drain_harmony_refresh_queue(int) to authenticated;
