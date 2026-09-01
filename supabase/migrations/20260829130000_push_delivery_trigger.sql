-- Fires a push whenever a notification row is created.
--
-- Hangs off the notifications table rather than off each source table
-- (likes, comments, follows, …) deliberately: every one of those already has
-- a trigger that decides whether a notification is warranted, applying the
-- recipient's preference and the block list. Duplicating that judgement here
-- would mean eight more places for the two to disagree — a push for
-- something the app never showed, or silence for something it did. One row
-- inserted, one push.
--
-- pg_net rather than a pg_cron poll: a "someone liked your post" that lands
-- up to a minute late is a different, worse product. Cron is still the right
-- tool for the weekly digests, which are not time-sensitive.

-- Where the edge function lives and the shared secret it checks. Held in a
-- settings table rather than hardcoded so the anon/service keys never end up
-- in a migration file, and so this works the same across projects.
create table if not exists public.app_config (
  key text primary key,
  value text not null
);

alter table public.app_config enable row level security;
-- No policies: readable and writable only by the service role and by
-- security-definer functions like the one below. Nothing client-side has any
-- business reading this.

comment on table public.app_config is
  'Server-side settings for database-initiated HTTP calls. No RLS policies by design — service role only.';

create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.app_config where key = 'push_function_url';
  select value into v_secret from public.app_config where key = 'push_trigger_secret';

  -- Unconfigured is not an error: the in-app notification is already
  -- written, and push is an extra channel on top of it. Failing here would
  -- roll back the notification itself.
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    body := jsonb_build_object('notificationId', new.id)
  );

  return new;
end;
$$;

-- AFTER INSERT: pg_net queues the request and returns immediately, so this
-- adds no meaningful latency to the insert that triggered it.
create trigger notifications_send_push
  after insert on public.notifications
  for each row execute function public.notify_push();
