-- Somewhere for a person to say "this is broken".
--
-- NOT the `reports` table, which is content moderation — reporting a user or
-- a review to an admin, with a ban or a takedown at the end of it. Sharing
-- that table would mean a bug report landing in a moderation queue whose
-- available actions are "ban this person" and "delete their review".
--
-- NOT client_errors either, which is the automatic side: a render crash
-- caught by the error boundary, deduplicated one-per-hour so a crash loop
-- cannot flood it. That dedupe is exactly wrong here — somebody who writes
-- two reports meant to send two reports — and its stack/component_stack
-- columns have nothing to hold.
--
-- The two are complements. client_errors knows what threw and nothing about
-- what the person was trying to do; this knows what they were trying to do
-- and nothing about what threw.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  -- Captured rather than asked for. "Which version are you on" is a question
  -- nobody can answer and every report needs the answer to.
  app_version text,
  platform text,
  -- Where they were when they hit it, from the router. Far more reliable
  -- than a description of the screen, and free.
  route text,
  created_at timestamptz not null default now(),
  -- Set when it has been dealt with. Nullable rather than a status enum:
  -- there are two states and inventing more would be inventing a workflow
  -- that does not exist yet.
  resolved_at timestamptz
);

create index if not exists bug_reports_unresolved
  on public.bug_reports (created_at desc)
  where resolved_at is null;

alter table public.bug_reports enable row level security;

-- Readable by the person who wrote it, so a "your reports" list is possible
-- later without another migration. Deliberately NOT readable by anyone else:
-- a bug report can quote whatever was on screen at the time.
create policy "bug_reports_select_own" on public.bug_reports
  for select using (auth.uid() = user_id);

-- Writing one.
--
-- Through a function rather than an insert policy, for the same reason
-- report_client_error is: the row's user_id is stamped from the session
-- rather than supplied, and the text is capped before it is stored.
create or replace function public.submit_bug_report(
  p_message text,
  p_app_version text default null,
  p_platform text default null,
  p_route text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if coalesce(btrim(p_message), '') = '' then
    raise exception 'empty report';
  end if;

  -- A soft brake rather than a rate limit: five in an hour is somebody
  -- reporting several genuine things, fifty is a stuck button or a script.
  if (
    select count(*) from public.bug_reports b
    where b.user_id = auth.uid() and b.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'too many reports' using errcode = 'P0003';
  end if;

  insert into public.bug_reports (user_id, message, app_version, platform, route)
  values (
    auth.uid(),
    left(btrim(p_message), 2000),
    left(p_app_version, 50),
    left(p_platform, 50),
    left(p_route, 200)
  );
end;
$$;

revoke all on function public.submit_bug_report(text, text, text, text) from public, anon;
grant execute on function public.submit_bug_report(text, text, text, text) to authenticated;
