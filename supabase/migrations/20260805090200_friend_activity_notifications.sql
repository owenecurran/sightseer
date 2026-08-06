-- Opt-in notification for when someone you follow posts a new review —
-- off by default (unlike notify_likes/comments/follows/saves) since this is
-- explicitly an "if you select it" feature, not a default-on one. "Friend"
-- here just means someone you follow; recipients of a new-visit
-- notification are the poster's followers (people who follow *them*), each
-- gated by their own opt-in.
alter table public.users add column notify_friend_activity boolean not null default false;

create function public.notify_friend_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- is_blocked is load-bearing here, not redundant: visits_insert_own has no
  -- cross-user visibility check at all, so this fan-out is the first place
  -- blocking gets enforced for this specific event.
  insert into public.notifications (recipient_id, actor_id, type, visit_id)
  select f.follower_id, new.user_id, 'friend_visit', new.id
  from public.follows f
  join public.users u on u.id = f.follower_id
  where f.followee_id = new.user_id
    and f.status = 'accepted'
    and u.notify_friend_activity = true
    and not public.is_blocked(f.follower_id, new.user_id);
  return new;
end;
$$;

create trigger visits_notify_followers
  after insert on public.visits
  for each row execute function public.notify_friend_visit();
