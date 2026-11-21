-- Row ownership alone does not protect server-managed columns on that row.
revoke update on public.users from public, anon, authenticated;
grant update (
  handle, name, bio, avatar_r2_key, is_private, birthdate, home_place_id,
  show_map, map_default_center_lat, map_default_center_lng, map_default_zoom,
  map_default_layers, profile_section_order, has_set_demographics,
  has_set_privacy, has_seen_find_friends, has_shared_invite, tutorial_seen_at,
  terms_accepted_at, terms_version, discoverable_by_contacts, feed_last_viewed_at,
  notify_likes, notify_comments, notify_follows, notify_tags, notify_saves,
  notify_friend_activity, notify_nearby_reviews, notify_friend_digest,
  notify_contact_joins, notify_close_friend_posts, notify_review_nudge
) on public.users to authenticated;

-- Keep follow relationships immutable. Existing RLS limits approval to the
-- followee; new requests take their status from the database at insert time.
revoke update on public.follows from public, anon, authenticated;
grant update (status) on public.follows to authenticated;

create function private.set_initial_follow_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_is_private boolean;
begin
  select u.is_private into account_is_private
  from public.users u where u.id = new.followee_id
  for share;

  new.status := case when account_is_private then 'pending' else 'accepted' end;
  return new;
end;
$$;

revoke all on function private.set_initial_follow_status() from public, anon, authenticated;
create trigger follows_set_initial_status
  before insert on public.follows
  for each row execute function private.set_initial_follow_status();

-- An R2 namespace belongs to the entity whose upload signer minted it. An
-- exact prefix and filename check prevents another entity's key from being
-- registered even when the caller owns the destination row.
create function private.matches_media_key(object_key text, namespace text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select pg_catalog.starts_with(object_key, namespace)
     and pg_catalog.substr(object_key, pg_catalog.length(namespace) + 1)
       ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpeg|png|webp)$';
$$;

create function private.guard_media_keys()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_key text;
  namespace text;
  owner_id uuid;
begin
  case tg_table_name
    when 'photos' then
      object_key := new.r2_key;
      namespace := case when new.draft_visit_id is not null
        then 'drafts/' || new.draft_visit_id || '/'
        else 'visits/' || new.visit_id || '/' end;
      if new.thumb_r2_key is not null and new.thumb_r2_key is distinct from
          pg_catalog.regexp_replace(object_key, '(\.[^.]+)$', '_thumb\1') then
        raise exception 'Photo thumbnail does not match its original' using errcode = '23514';
      end if;
    when 'users' then
      object_key := new.avatar_r2_key;
      namespace := 'avatars/' || new.id || '/';
    when 'boards', 'travel_books', 'articles' then
      object_key := new.cover_photo_r2_key;
      namespace := 'covers/' || tg_table_name || '/' || new.id || '/';
    when 'travel_book_recaps' then
      object_key := new.cover_r2_key;
      namespace := 'travel-book-recaps/' || new.id || '/';
    when 'profile_prompt_attachments' then
      object_key := new.photo_r2_key;
      select p.user_id into owner_id from public.profile_prompts p where p.id = new.prompt_id;
      namespace := 'prompt-photos/' || owner_id || '/';
  end case;

  if object_key is not null and private.matches_media_key(object_key, namespace) is not true then
    raise exception 'Media object does not belong to this record' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.matches_media_key(text, text) from public, anon, authenticated;
revoke all on function private.guard_media_keys() from public, anon, authenticated;

-- A caller must not be able to claim the namespace of a deleted parent
-- whose old objects still exist in storage. The app uses returned IDs.
create function private.guard_media_parent_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.id := pg_catalog.gen_random_uuid();
    elsif new.id is distinct from old.id then
      raise exception 'Record ID cannot change' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_media_parent_id() from public, anon, authenticated;

do $$
declare
  parent_table text;
begin
  foreach parent_table in array array['visits', 'draft_visits', 'boards', 'travel_books', 'articles', 'travel_book_recaps']
  loop
    execute format(
      'create trigger assign_media_parent_id before insert or update of id on public.%I
       for each row execute function private.guard_media_parent_id()',
      parent_table
    );
  end loop;
end;
$$;

-- Photo ownership is enforced on insert. The existing owner-checked
-- publish_draft function can then move the row without moving its R2 object.
create trigger photos_guard_media_keys before insert on public.photos
  for each row execute function private.guard_media_keys();
create trigger users_guard_media_keys before insert or update of avatar_r2_key on public.users
  for each row execute function private.guard_media_keys();
create trigger boards_guard_media_keys before insert or update of id, cover_photo_r2_key on public.boards
  for each row execute function private.guard_media_keys();
create trigger travel_books_guard_media_keys before insert or update of id, cover_photo_r2_key on public.travel_books
  for each row execute function private.guard_media_keys();
create trigger articles_guard_media_keys before insert or update of id, cover_photo_r2_key on public.articles
  for each row execute function private.guard_media_keys();
create trigger recaps_guard_media_keys before insert or update of id, cover_r2_key on public.travel_book_recaps
  for each row execute function private.guard_media_keys();
create trigger prompt_attachments_guard_media_keys
  before insert or update of prompt_id, photo_r2_key on public.profile_prompt_attachments
  for each row execute function private.guard_media_keys();
