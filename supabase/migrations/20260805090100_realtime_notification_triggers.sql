-- Real-time notification triggers for likes, comments, follows, and board/
-- travel-book saves — the three notify_likes/notify_comments/notify_follows
-- prefs on users (20260801092000_notification_prefs.sql) have existed since
-- that migration but were never wired to anything that actually sends a
-- notification; this is what finally does it. Each trigger is security
-- definer (bypasses RLS) so it re-derives is_blocked itself rather than
-- assuming the inserting row's own RLS already covered it — same reasoning
-- get_collection_stats used earlier for the same category of function.
alter table public.users add column notify_saves boolean not null default true;

create function public.notify_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.visits where id = new.visit_id;
  if v_owner is null or v_owner = new.user_id then
    return new;
  end if;
  if not exists (select 1 from public.users where id = v_owner and notify_likes = true) then
    return new;
  end if;
  if public.is_blocked(v_owner, new.user_id) then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, visit_id)
  values (v_owner, new.user_id, 'like', new.visit_id);
  return new;
end;
$$;

create trigger likes_notify_owner
  after insert on public.likes
  for each row execute function public.notify_like();

create function public.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.visits where id = new.visit_id;
  if v_owner is null or v_owner = new.user_id then
    return new;
  end if;
  if not exists (select 1 from public.users where id = v_owner and notify_comments = true) then
    return new;
  end if;
  if public.is_blocked(v_owner, new.user_id) then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, visit_id)
  values (v_owner, new.user_id, 'comment', new.visit_id);
  return new;
end;
$$;

create trigger comments_notify_owner
  after insert on public.comments
  for each row execute function public.notify_comment();

-- Fires on every new follows row, whether it lands 'accepted' (public
-- account) or 'pending' (private account, follow request) — matches
-- notify_follows's own existing label ("New followers and follow requests"),
-- which already bundles both cases under one toggle.
create function public.notify_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.users where id = new.followee_id and notify_follows = true) then
    return new;
  end if;
  if public.is_blocked(new.followee_id, new.follower_id) then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, type)
  values (new.followee_id, new.follower_id, 'follow');
  return new;
end;
$$;

create trigger follows_notify_followee
  after insert on public.follows
  for each row execute function public.notify_follow();

create function public.notify_board_saved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.boards where id = new.board_id;
  if v_owner is null or v_owner = new.user_id then
    return new;
  end if;
  if not exists (select 1 from public.users where id = v_owner and notify_saves = true) then
    return new;
  end if;
  if public.is_blocked(v_owner, new.user_id) then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, board_id)
  values (v_owner, new.user_id, 'board_saved', new.board_id);
  return new;
end;
$$;

create trigger saved_boards_notify_owner
  after insert on public.saved_boards
  for each row execute function public.notify_board_saved();

create function public.notify_travel_book_saved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.travel_books where id = new.travel_book_id;
  if v_owner is null or v_owner = new.user_id then
    return new;
  end if;
  if not exists (select 1 from public.users where id = v_owner and notify_saves = true) then
    return new;
  end if;
  if public.is_blocked(v_owner, new.user_id) then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, travel_book_id)
  values (v_owner, new.user_id, 'travel_book_saved', new.travel_book_id);
  return new;
end;
$$;

create trigger saved_travel_books_notify_owner
  after insert on public.saved_travel_books
  for each row execute function public.notify_travel_book_saved();
