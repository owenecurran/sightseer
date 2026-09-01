-- A weekly "you missed a lot" summary for reviews by people you follow.
--
-- Distinct from notify_friend_activity, which fires once per review as it
-- happens. This is the opposite trade: nothing at all while you keep up, one
-- line when you have not.

alter table public.users
  -- Defaulted ON, unlike notify_nearby_reviews. A weekly digest that only
  -- fires when you have actually fallen behind is low-volume by
  -- construction, where per-review notifications are not — which is why
  -- those default off and this does not.
  add column notify_friend_digest boolean not null default true,
  -- Checkpoint, so a week of silence is not re-reported every week.
  add column last_friend_digest_at timestamptz not null default now();

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'board_item_added',
      'travel_book_item_added',
      'board_saved',
      'travel_book_saved',
      'like',
      'comment',
      'follow',
      'friend_visit',
      'nearby_review_digest',
      'tagged',
      'friend_review_digest'
    )
  );

-- Carries a count and nothing else, exactly like nearby_review_digest.
alter table public.notifications drop constraint notifications_check;
alter table public.notifications
  add constraint notifications_check check (
    (type = 'board_item_added' and board_id is not null and board_item_id is not null
      and travel_book_id is null and travel_book_item_id is null and visit_id is null)
    or (type = 'travel_book_item_added' and travel_book_id is not null and travel_book_item_id is not null
      and board_id is null and board_item_id is null and visit_id is null)
    or (type = 'board_saved' and board_id is not null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null and visit_id is null)
    or (type = 'travel_book_saved' and travel_book_id is not null and travel_book_item_id is null
      and board_id is null and board_item_id is null and visit_id is null)
    or (type in ('like', 'comment', 'friend_visit', 'tagged') and visit_id is not null
      and board_id is null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null)
    or (type = 'follow' and visit_id is null
      and board_id is null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null)
    or (type in ('nearby_review_digest', 'friend_review_digest') and visit_id is null
      and board_id is null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null)
  );

create or replace function public.run_friend_review_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer;
  v_floor timestamptz;
  v_run_started_at timestamptz := now();
  -- "Missed a lot", not "missed something". One or two unread reviews is
  -- the normal state of any feed and is not worth a push.
  c_min_reviews constant integer := 3;
begin
  for r in
    select id, feed_last_viewed_at, last_friend_digest_at
    from public.users
    where notify_friend_digest = true
  loop
    -- What counts as missed: newer than the last time they actually looked
    -- at the feed, so anyone keeping up gets nothing. Floored at the last
    -- digest as well, so a long absence is reported once rather than
    -- re-counted every week. feed_last_viewed_at is null for anyone who has
    -- never opened the feed, where the checkpoint alone is the right window.
    v_floor := greatest(
      coalesce(r.feed_last_viewed_at, r.last_friend_digest_at),
      r.last_friend_digest_at
    );

    select count(*)
      into v_count
    from public.visits v
    join public.follows f
      on f.followee_id = v.user_id
     and f.follower_id = r.id
     and f.status = 'accepted'
    where v.created_at > v_floor
      and v.created_at <= v_run_started_at
      and v.user_id <> r.id
      and public.can_view_user_content(r.id, v.user_id)
      and not public.is_blocked(r.id, v.user_id);

    if v_count >= c_min_reviews then
      insert into public.notifications (recipient_id, type, digest_review_count)
      values (r.id, 'friend_review_digest', v_count);
    end if;

    -- Advances every run whether or not anything was sent, so the lookback
    -- window cannot grow unbounded for someone who never opens the app.
    update public.users set last_friend_digest_at = v_run_started_at where id = r.id;
  end loop;
end;
$$;

-- Thursday rather than Monday: nearby-review-digest-weekly already runs
-- Mondays at 15:00 UTC, and two digests landing minutes apart reads as one
-- app being noisy rather than two useful summaries.
select cron.schedule(
  'friend-review-digest-weekly',
  '0 17 * * 4',
  $$select public.run_friend_review_digest();$$
);
