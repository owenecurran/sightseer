-- Somewhere for a crash on somebody else's phone to land.
--
-- WHY THIS AND NOT SENTRY
--
-- Sentry is the better tool and the wrong size for right now: it is a
-- third-party data processor, which needs a privacy policy this project does
-- not have yet (PRIVACY_POLICY_URL in src/lib/legal.ts is still empty, for
-- the same reason Branch is still inert). This is the part of it that is
-- actually needed today — a render crash on a tester's device leaving a
-- trace somewhere other than a console nobody is attached to.
--
-- SMS failures deliberately do NOT come here. Twilio's own console already
-- logs every verification attempt with the provider's reason, which is
-- better than anything this could record second-hand.
--
-- SCOPE: significant errors only. The error boundary catching a render
-- crash is one. Every mapped auth message is not — those stay in the dev
-- console via authErrorMessage.

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- Where it came from: 'error-boundary', and whatever else gets wired in.
  context text not null,
  message text not null,
  -- Minified in a release build and still worth having: the frame names
  -- survive often enough to point at a file, and the component stack
  -- usually names a real component either way.
  stack text,
  component_stack text,
  platform text,
  app_version text,
  created_at timestamptz not null default now()
);

create index if not exists client_errors_recent on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

-- No policies at all, for anybody. Nothing in the app reads these back —
-- they are written through the definer function below and read by whoever
-- is looking at the database. A table a client cannot select is a table
-- that cannot be mined for other people's failures.

-- Writing one.
--
-- Through a function rather than an insert policy so the row's user_id is
-- stamped from the session rather than supplied, and so the text can be
-- capped before it is stored: a stack trace from a loop can be enormous, and
-- nothing past a few kilobytes of it has ever been read by anyone.
create or replace function public.report_client_error(
  p_context text,
  p_message text,
  p_stack text default null,
  p_component_stack text default null,
  p_platform text default null,
  p_app_version text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  -- A crash that re-renders and crashes again would otherwise write a row
  -- per frame. One per user, context and message an hour says everything
  -- the hundredth copy would.
  if exists (
    select 1 from public.client_errors e
    where e.user_id = auth.uid()
      and e.context = p_context
      and e.message = left(coalesce(p_message, ''), 500)
      and e.created_at > now() - interval '1 hour'
  ) then
    return;
  end if;

  insert into public.client_errors (
    user_id, context, message, stack, component_stack, platform, app_version
  )
  values (
    auth.uid(),
    left(coalesce(p_context, 'unknown'), 100),
    left(coalesce(p_message, ''), 500),
    left(p_stack, 4000),
    left(p_component_stack, 4000),
    left(p_platform, 50),
    left(p_app_version, 50)
  );
end;
$$;

-- Authenticated only. An open insert endpoint on a production database is a
-- spam target, and the crashes worth chasing are the ones happening to
-- somebody who got far enough in to have an account. A crash on the
-- signed-out welcome screen is the gap this accepts.
revoke all on function public.report_client_error(text, text, text, text, text, text)
  from public, anon;
grant execute on function public.report_client_error(text, text, text, text, text, text)
  to authenticated;
