-- Two scheduled notifications.
--
--   close_friend_posts — the people you actually interact with have posted
--     things you have not seen. Compiled, capped, and delayed.
--   review_nudge       — a weekly "you have not written one in a while".
--
-- NOT a replacement for friend_visit, which stays exactly as it is with its
-- own toggle. That one fires immediately, for every account you follow, with
-- no cap; somebody who wants that can still have it. This is for everybody
-- else, and the two are independent.

-- =========================================================================
-- Preferences
-- =========================================================================

-- Default ON, unlike notify_friend_activity's default of false. That one is
-- uncapped and fires per post, which is why it had to be opt-in; this is at
-- most one a day and only about people you already engage with.
alter table public.users
  add column if not exists notify_close_friend_posts boolean not null default true;

-- Default OFF. A nudge to make something is a different kind of message from
-- a notification about something that happened, and the polite default for
-- "we noticed you have not posted" is not to send it.
alter table public.users
  add column if not exists notify_review_nudge boolean not null default false;

-- =========================================================================
-- Notification types
-- =========================================================================

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'board_item_added', 'travel_book_item_added', 'board_saved',
    'travel_book_saved', 'like', 'comment', 'follow', 'friend_visit',
    'nearby_review_digest', 'tagged', 'friend_review_digest',
    'contact_joined', 'close_friend_posts', 'review_nudge'
  ]));

alter table public.notifications drop constraint if exists notifications_check;
alter table public.notifications add constraint notifications_check
  check (
    (type = 'board_item_added'
      and board_id is not null and board_item_id is not null
      and travel_book_id is null and travel_book_item_id is null and visit_id is null)
    or (type = 'travel_book_item_added'
      and travel_book_id is not null and travel_book_item_id is not null
      and board_id is null and board_item_id is null and visit_id is null)
    or (type = 'board_saved'
      and board_id is not null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null and visit_id is null)
    or (type = 'travel_book_saved'
      and travel_book_id is not null and travel_book_item_id is null
      and board_id is null and board_item_id is null and visit_id is null)
    or (type = any (array['like', 'comment', 'friend_visit', 'tagged'])
      and visit_id is not null
      and board_id is null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null)
    or (type = any (array['follow', 'contact_joined'])
      and visit_id is null and board_id is null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null)
    -- The compiled ones. close_friend_posts and review_nudge join the
    -- digests here because they have the same shape: they are about several
    -- things, or about nothing in particular, so no single id fits.
    or (type = any (array[
          'nearby_review_digest', 'friend_review_digest',
          'close_friend_posts', 'review_nudge'
        ])
      and visit_id is null and board_id is null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null)
  );

-- =========================================================================
-- Who you actually interact with
-- =========================================================================

-- Interaction is a LIKE or a COMMENT, not a follow.
--
-- Following is a one-time declaration and goes stale — plenty of accounts
-- follow people whose posts they have not opened in a year. Liking and
-- commenting are repeated, recent, and effortful, which is what "often
-- interact with" has to mean for this to be worth sending.
create or replace function public.close_contacts(p_user uuid, p_min_interactions int default 3)
returns table (other_id uuid, interactions bigint)
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select v.user_id as other_id
    from public.likes l
    join public.visits v on v.id = l.visit_id
    where l.user_id = p_user
      and l.created_at > now() - interval '60 days'
      and v.user_id <> p_user
    union all
    select v.user_id
    from public.comments c
    join public.visits v on v.id = c.visit_id
    where c.user_id = p_user
      and c.created_at > now() - interval '60 days'
      and v.user_id <> p_user
  )
  select other_id, count(*) as interactions
  from recent
  group by other_id
  having count(*) >= p_min_interactions;
$$;

revoke all on function public.close_contacts(uuid, int) from public, anon, authenticated;

-- =========================================================================
-- close_friend_posts
-- =========================================================================

-- Run hourly. Everything about the timing lives in the WHERE clause rather
-- than in the schedule, so the cadence can change without the rules moving.
create or replace function public.run_close_friend_posts()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sent integer := 0;
  r record;
  v_count integer;
  v_latest uuid;
begin
  for r in
    select u.id, u.feed_last_viewed_at
    from public.users u
    where u.notify_close_friend_posts = true
      and u.banned_at is null
      -- One a day. Checked per recipient rather than globally so a busy
      -- hour cannot starve anyone.
      and not exists (
        select 1 from public.notifications n
        where n.recipient_id = u.id
          and n.type = 'close_friend_posts'
          and n.created_at > now() - interval '24 hours'
      )
  loop
    -- The posts worth mentioning to this person.
    with candidates as (
      select v.id, v.user_id, v.created_at
      from public.visits v
      join public.close_contacts(r.id) cc on cc.other_id = v.user_id
      where
        -- An hour old at least: long enough that somebody who was going to
        -- see it in the feed already has, and this is not racing the app.
        v.created_at < now() - interval '1 hour'
        -- and recent enough to still be worth surfacing.
        and v.created_at > now() - interval '7 days'
        -- NOT SEEN. feed_last_viewed_at is a coarse proxy — it says when the
        -- feed was last opened, not which cards were actually on screen —
        -- but a post made before that moment has almost certainly scrolled
        -- past, and telling somebody about a post they already scrolled past
        -- is the thing that makes a notification feel like spam. A null
        -- means they have never opened the feed, so nothing is seen.
        and (r.feed_last_viewed_at is null or v.created_at > r.feed_last_viewed_at)
        -- Not already engaged with.
        and not exists (
          select 1 from public.likes l where l.visit_id = v.id and l.user_id = r.id
        )
        and not exists (
          select 1 from public.comments c where c.visit_id = v.id and c.user_id = r.id
        )
        and not public.is_blocked(r.id, v.user_id)
        and not public.is_blocked(v.user_id, r.id)
        and public.can_view_user_content(r.id, v.user_id)
      order by v.created_at desc
      -- Two or three, not everything. A list long enough to scroll is a
      -- feed, and they already have one of those.
      limit 3
    )
    select count(*), (select user_id from candidates order by created_at desc limit 1)
      into v_count, v_latest
    from candidates;

    if v_count > 0 then
      insert into public.notifications (recipient_id, actor_id, type, digest_review_count)
      values (r.id, v_latest, 'close_friend_posts', v_count);
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.run_close_friend_posts() from public, anon, authenticated;

-- =========================================================================
-- review_nudge
-- =========================================================================

create or replace function public.run_review_nudge()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sent integer;
begin
  with eligible as (
    select u.id
    from public.users u
    where u.notify_review_nudge = true
      and u.banned_at is null
      and u.handle is not null
      -- Nothing posted in a fortnight. Someone who posted last week does not
      -- need reminding, and someone who has never posted at all is still
      -- being onboarded — the tutorial and the empty feed are already
      -- asking.
      and exists (select 1 from public.visits v where v.user_id = u.id)
      and not exists (
        select 1 from public.visits v
        where v.user_id = u.id and v.created_at > now() - interval '14 days'
      )
      -- At most one a week, whatever the schedule does.
      and not exists (
        select 1 from public.notifications n
        where n.recipient_id = u.id
          and n.type = 'review_nudge'
          and n.created_at > now() - interval '7 days'
      )
  )
  insert into public.notifications (recipient_id, type)
  select id, 'review_nudge' from eligible;

  get diagnostics v_sent = row_count;
  return v_sent;
end;
$$;

revoke all on function public.run_review_nudge() from public, anon, authenticated;

-- =========================================================================
-- Schedule
-- =========================================================================

-- Hourly, because the rule is "an hour after posting" and a coarser
-- schedule would make that "an hour, or six, depending when you posted".
select cron.unschedule('close-friend-posts-hourly')
where exists (select 1 from cron.job where jobname = 'close-friend-posts-hourly');
select cron.schedule('close-friend-posts-hourly', '7 * * * *',
  $job$select public.run_close_friend_posts();$job$);

-- Sunday evening: the end of a weekend is when somebody has something to
-- write about and the time to write it.
select cron.unschedule('review-nudge-weekly')
where exists (select 1 from cron.job where jobname = 'review-nudge-weekly');
select cron.schedule('review-nudge-weekly', '0 18 * * 0',
  $job$select public.run_review_nudge();$job$);
