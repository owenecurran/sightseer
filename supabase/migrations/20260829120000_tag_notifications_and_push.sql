-- Three things the notification system was missing before it could reach a
-- phone: a notification for being tagged in someone's review, somewhere to
-- keep device push tokens, and a record of accepting the terms.

-- =========================================================================
-- Being tagged in a review
-- =========================================================================
-- Every other notifiable event already had a type and a trigger; this one
-- did not, even though visit_tagged_users has existed since July. Being
-- named in someone else's post is the most directly personal of these, so
-- it defaults ON like likes/comments/follows rather than off like the
-- digests.
alter table public.users
  add column notify_tags boolean not null default true;

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
      'tagged'
    )
  );

-- 'tagged' points at a visit, exactly like like/comment/friend_visit, so it
-- joins that arm of the shape constraint rather than needing its own.
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
    or (type = 'nearby_review_digest' and visit_id is null
      and board_id is null and board_item_id is null
      and travel_book_id is null and travel_book_item_id is null)
  );

-- Same shape as notify_like: never notify yourself, respect the recipient's
-- preference, and stay silent between blocked users.
create or replace function public.notify_tagged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  select user_id into v_author from public.visits where id = new.visit_id;
  -- Tagging yourself in your own review is not an event.
  if v_author is null or new.user_id = v_author then
    return new;
  end if;
  if not exists (select 1 from public.users where id = new.user_id and notify_tags = true) then
    return new;
  end if;
  if public.is_blocked(new.user_id, v_author) then
    return new;
  end if;
  -- The tagged person is the recipient; the review's author is the actor.
  insert into public.notifications (recipient_id, actor_id, type, visit_id)
  values (new.user_id, v_author, 'tagged', new.visit_id);
  return new;
end;
$$;

create trigger visit_tagged_users_notify
  after insert on public.visit_tagged_users
  for each row execute function public.notify_tagged();

-- =========================================================================
-- Device push tokens
-- =========================================================================
-- One row per device, not per user: people sign in on a phone and a tablet,
-- and a token belongs to an install rather than to an account. The token is
-- the primary key so re-registering the same device updates in place
-- instead of accumulating duplicates that would each get a copy of every
-- push.
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- A device token is only ever the business of the account it belongs to.
-- The sender runs with the service role, which bypasses RLS, so nothing
-- here needs to grant read access to anyone else.
create policy "push_tokens_select_own" on public.push_tokens
  for select using (auth.uid() = user_id);

create policy "push_tokens_insert_own" on public.push_tokens
  for insert with check (auth.uid() = user_id);

create policy "push_tokens_update_own" on public.push_tokens
  for update using (auth.uid() = user_id);

-- Signing out, or revoking notifications, deletes the row.
create policy "push_tokens_delete_own" on public.push_tokens
  for delete using (auth.uid() = user_id);

create trigger push_tokens_set_updated_at before update on public.push_tokens
  for each row execute function public.set_updated_at();

-- =========================================================================
-- Terms acceptance
-- =========================================================================
-- A timestamp plus the version accepted, not a boolean: terms get revised,
-- and "has agreed to something, once" cannot tell you whether they agreed
-- to what is in force now. Null means never accepted.
alter table public.users
  add column terms_accepted_at timestamptz,
  add column terms_version text;
