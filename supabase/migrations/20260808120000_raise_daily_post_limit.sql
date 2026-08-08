-- Raises the daily post limit from 30 to 40 (user's own call, not a
-- technical constraint) — same trigger/function shape as
-- 20260806100100_publish_draft_and_daily_limit.sql, just the threshold and
-- its message text.
create or replace function public.enforce_daily_post_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.visits
  where user_id = new.user_id
    and created_at >= now() - interval '24 hours';

  if recent_count >= 40 then
    raise exception 'You''ve reached today''s limit of 40 published reviews. Try again later.';
  end if;

  return new;
end;
$$;
