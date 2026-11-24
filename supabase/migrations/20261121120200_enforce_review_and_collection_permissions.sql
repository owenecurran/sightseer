-- Both direct inserts and publish_draft pass through this trigger.
create or replace function public.enforce_daily_post_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author_banned boolean;
  recent_count integer;
begin
  -- Serialize publishing for one account, including a concurrent ban.
  select u.banned_at is not null into author_banned
  from public.users u where u.id = new.user_id
  for no key update;

  if author_banned then
    raise exception 'This account cannot publish reviews.' using errcode = '42501';
  end if;

  select count(*) into recent_count
  from public.visits v
  where v.user_id = new.user_id and v.created_at >= now() - interval '24 hours';

  if recent_count >= 40 then
    raise exception 'You''ve reached today''s limit of 40 published reviews. Try again later.';
  end if;

  return new;
end;
$$;

create or replace function public.publish_draft(draft_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft public.draft_visits%rowtype;
  new_visit_id uuid;
begin
  -- Lock in the same order as account deletion: owner, then draft.
  perform 1 from public.users u where u.id = auth.uid() for no key update;
  select d.* into draft from public.draft_visits d
  where d.id = draft_id and d.user_id = auth.uid() for update;
  if not found then
    raise exception 'Draft not found.';
  end if;
  if draft.place_id is null then
    raise exception 'This draft needs a location before it can be published.';
  end if;

  insert into public.visits (user_id, place_id, rating, note, visited_on)
  values (draft.user_id, draft.place_id, draft.rating, draft.note, draft.visited_on)
  returning id into new_visit_id;

  update public.photos p
  set visit_id = new_visit_id, draft_visit_id = null
  where p.draft_visit_id = draft_id;

  delete from public.draft_visits d where d.id = draft_id;
  return new_visit_id;
end;
$$;

revoke all on function public.publish_draft(uuid) from public, anon;
grant execute on function public.publish_draft(uuid) to authenticated;

create function private.guard_visit_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.created_at := now();
    elsif new.created_at is distinct from old.created_at then
      raise exception 'Review creation time cannot change' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_visit_created_at() from public, anon, authenticated;
create trigger visits_guard_created_at
  before insert or update of created_at on public.visits
  for each row execute function private.guard_visit_created_at();

-- An owner may edit their board, while only admins may curate Discover.
create function private.guard_board_featured()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin_user() then
    if (tg_op = 'INSERT' and new.is_featured)
      or (tg_op = 'UPDATE' and new.is_featured is distinct from old.is_featured) then
      raise exception 'Administrator access required to feature a board' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_board_featured() from public, anon, authenticated;
create trigger boards_guard_featured
  before insert or update of is_featured on public.boards
  for each row execute function private.guard_board_featured();

-- Existing saved rows can survive a privacy change. A preference edit cannot
-- retarget the save, and every new notification checks current visibility.
revoke update on public.saved_boards, public.saved_travel_books, public.notifications
  from public, anon, authenticated;
grant update (notify_on_new_items) on public.saved_boards, public.saved_travel_books to authenticated;
grant update (is_read) on public.notifications to authenticated;

create function private.can_receive_collection_item(
  recipient uuid, actor uuid, board uuid, travel_book uuid, visit uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case when board is not null then exists (
    select 1 from public.boards b
    where b.id = board and not b.is_private and public.can_view_user_content(recipient, b.user_id)
  ) else exists (
    select 1 from public.travel_books b
    where b.id = travel_book
      and not public.is_blocked(recipient, actor)
      and not public.is_blocked(recipient, b.user_id)
      and (
        public.is_travel_book_participant(b.id, recipient)
        or (not b.is_private and public.can_view_user_content(recipient, b.user_id))
      )
  ) end and (visit is null or exists (
    select 1 from public.visits v
    where v.id = visit and public.can_view_user_content(recipient, v.user_id)
  ));
$$;

revoke all on function private.can_receive_collection_item(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.notify_board_savers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, board_id, board_item_id)
  select sb.user_id, b.user_id, 'board_item_added', new.board_id, new.id
  from public.saved_boards sb
  join public.boards b on b.id = sb.board_id
  where sb.board_id = new.board_id and sb.notify_on_new_items
    and sb.user_id <> b.user_id
    and private.can_receive_collection_item(sb.user_id, b.user_id, new.board_id, null, new.visit_id);
  return new;
end;
$$;

create or replace function public.notify_travel_book_savers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, travel_book_id, travel_book_item_id)
  select stb.user_id, new.added_by, 'travel_book_item_added', new.travel_book_id, new.id
  from public.saved_travel_books stb
  where stb.travel_book_id = new.travel_book_id and stb.notify_on_new_items
    and stb.user_id <> new.added_by
    and private.can_receive_collection_item(stb.user_id, new.added_by, null, new.travel_book_id, new.visit_id);
  return new;
end;
$$;

-- A queued push still needs the same visibility when the worker sends it.
create function public.can_deliver_collection_notification(p_notification_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case n.type
      when 'board_item_added' then exists (
        select 1 from public.board_items bi
        where bi.id = n.board_item_id and bi.board_id = n.board_id
          and private.can_receive_collection_item(n.recipient_id, n.actor_id, bi.board_id, null, bi.visit_id)
      )
      when 'travel_book_item_added' then exists (
        select 1 from public.travel_book_items ti
        where ti.id = n.travel_book_item_id and ti.travel_book_id = n.travel_book_id
          and private.can_receive_collection_item(n.recipient_id, n.actor_id, null, ti.travel_book_id, ti.visit_id)
      )
      else false
    end
    from public.notifications n where n.id = p_notification_id
  ), false);
$$;

revoke all on function public.can_deliver_collection_notification(uuid) from public, anon, authenticated;
grant execute on function public.can_deliver_collection_notification(uuid) to service_role;

-- The referenced item policies apply both collection and review visibility.
create policy notifications_require_visible_collection_item on public.notifications
  as restrictive for select to authenticated
  using (case type
    when 'board_item_added' then exists (
      select 1 from public.board_items bi where bi.id = notifications.board_item_id
    )
    when 'travel_book_item_added' then not public.is_blocked(auth.uid(), actor_id) and exists (
      select 1 from public.travel_book_items ti
      join public.travel_books b on b.id = ti.travel_book_id
      where ti.id = notifications.travel_book_item_id and not public.is_blocked(auth.uid(), b.user_id)
    )
    else true
  end);
