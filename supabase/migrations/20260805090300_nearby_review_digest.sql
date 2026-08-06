-- Periodic digest: "N new reviews at M places you've been" — the one
-- notification type in this batch that's explicitly NOT real-time (product
-- decision, confirmed via user Q&A). No scheduled-job mechanism existed
-- anywhere in this schema before this migration (no pg_cron, no
-- cron-triggered Edge Function) — this is genuinely new infrastructure, not
-- a variant of the AFTER INSERT trigger pattern every other notification
-- type in this batch uses.
create extension if not exists pg_cron;

alter table public.users
  add column notify_nearby_reviews boolean not null default false,
  -- Defaulted to now() at migration time so the very first run only looks
  -- forward, not across the app's entire pre-existing review history.
  add column last_nearby_digest_at timestamptz not null default now();

-- security definer: iterates every opted-in user, not just auth.uid() — only
-- ever invoked by cron.schedule below, never granted to `authenticated`.
create function public.run_nearby_review_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_place_ids uuid[];
  v_count integer;
  v_run_started_at timestamptz := now();
begin
  for r in select id, last_nearby_digest_at from public.users where notify_nearby_reviews = true loop
    select array_agg(distinct v.place_id order by v.place_id), count(*)
      into v_place_ids, v_count
    from public.visits v
    where v.created_at > r.last_nearby_digest_at
      and v.created_at <= v_run_started_at
      and v.user_id <> r.id
      and v.place_id in (select place_id from public.visits where user_id = r.id)
      and public.can_view_user_content(r.id, v.user_id)
      and not public.is_blocked(r.id, v.user_id);

    if v_count > 0 then
      insert into public.notifications (recipient_id, type, digest_place_ids, digest_review_count)
      values (r.id, 'nearby_review_digest', v_place_ids[1:12], v_count);
    end if;

    -- Checkpoint advances every run regardless of whether a notification
    -- fired, so an inactive user's lookback window never grows unbounded.
    update public.users set last_nearby_digest_at = v_run_started_at where id = r.id;
  end loop;
end;
$$;

-- Weekly cadence — a judgment call, trivially changed later via
-- cron.alter_job against this same job name.
select cron.schedule(
  'nearby-review-digest-weekly',
  '0 15 * * 1',
  $$select public.run_nearby_review_digest();$$
);
