create table private.account_media_cleanup (
  object_key text primary key,
  account_id uuid not null,
  available_at timestamptz not null default now()
);

create index account_media_cleanup_available_idx
  on private.account_media_cleanup (available_at, object_key);
create index account_media_cleanup_account_idx
  on private.account_media_cleanup (account_id, available_at, object_key);

revoke all on private.account_media_cleanup from public, anon, authenticated;

-- Capture keys before FK cascades remove the rows that own them. The queue
-- is part of the same transaction as the deletion.
create function private.queue_deleted_account_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Lock parents before collecting their media. An upload being attached to
  -- one of these rows must finish before collection or lose the FK race.
  perform 1 from public.visits where user_id = old.id for update;
  perform 1 from public.draft_visits where user_id = old.id for update;
  perform 1 from public.boards where user_id = old.id for update;
  perform 1 from public.travel_books where user_id = old.id for update;
  perform 1 from public.profile_prompts where user_id = old.id for update;

  insert into private.account_media_cleanup (object_key, account_id)
  with owned_visit_photos as (
    select v.id, p.r2_key, p.thumb_r2_key
    from public.visits v
    join public.photos p on p.visit_id = v.id
    where v.user_id = old.id for update of p
  ), owned_draft_photos as (
    select d.id, p.r2_key, p.thumb_r2_key
    from public.draft_visits d
    join public.photos p on p.draft_visit_id = d.id
    where d.user_id = old.id for update of p
  ), valid_photos as (
    select p.r2_key, p.thumb_r2_key
    from owned_visit_photos p
    cross join lateral (select pg_catalog.split_part(p.r2_key, '/', 2) as draft_id) source
    where private.matches_media_key(p.r2_key, 'visits/' || p.id || '/')
      -- Publishing a draft keeps its original R2 key.
      or case
        when source.draft_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and private.matches_media_key(p.r2_key, 'drafts/' || source.draft_id || '/')
        then not exists (
          select 1 from public.draft_visits d where d.id = source.draft_id::uuid and d.user_id <> old.id
        )
        else false
      end
    union all
    select p.r2_key, p.thumb_r2_key
    from owned_draft_photos p
    where private.matches_media_key(p.r2_key, 'drafts/' || p.id || '/')
  ), owned_recaps as (
    select r.id, r.cover_r2_key
    from public.travel_book_recaps r
    join public.travel_books b on b.id = r.travel_book_id
    where b.user_id = old.id or r.author_id = old.id
    for update of r
  ), owned_prompt_attachments as (
    select a.photo_r2_key
    from public.profile_prompts p
    join public.profile_prompt_attachments a on a.prompt_id = p.id
    where p.user_id = old.id
    for update of a
  ), owned_media (object_key, namespace) as (
    select old.avatar_r2_key, 'avatars/' || old.id || '/'
    union all
    select b.cover_photo_r2_key, 'covers/boards/' || b.id || '/'
    from public.boards b where b.user_id = old.id
    union all
    select b.cover_photo_r2_key, 'covers/travel_books/' || b.id || '/'
    from public.travel_books b where b.user_id = old.id
    union all
    select r.cover_r2_key, 'travel-book-recaps/' || r.id || '/'
    from owned_recaps r
    union all
    select a.photo_r2_key, 'prompt-photos/' || old.id || '/'
    from owned_prompt_attachments a
  ), keys (object_key) as (
    select r2_key from valid_photos
    union all
    select thumb_r2_key from valid_photos
    where thumb_r2_key = pg_catalog.regexp_replace(r2_key, '(\.[^.]+)$', '_thumb\1')
    union all
    select object_key from owned_media where private.matches_media_key(object_key, namespace)
  )
  select object_key, old.id from keys
  on conflict (object_key) do nothing;

  return old;
end;
$$;

revoke all on function private.queue_deleted_account_media() from public, anon, authenticated;

create trigger users_queue_deleted_account_media
  before delete on public.users
  for each row execute function private.queue_deleted_account_media();

-- A visit or home location deleted by cascade has no remaining owner to
-- refresh. Deleting a single row for an existing owner still queues them.
create or replace function public.enqueue_harmony_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.harmony_refresh_queue (user_id)
  select u.id from public.users u where u.id = coalesce(new.user_id, old.user_id)
  for key share of u
  on conflict (user_id) do nothing;
  return null;
end;
$$;

-- Lease batches so concurrent workers can cooperate and interrupted work
-- becomes available again. R2 object deletion is idempotent.
create function public.claim_account_media_cleanup(p_account_id uuid default null)
returns table (object_key text)
language sql
security definer
set search_path = ''
as $$
  with batch as (
    select q.object_key from private.account_media_cleanup q
    where q.available_at <= now() and (p_account_id is null or q.account_id = p_account_id)
    order by q.available_at, q.object_key
    limit 500
    for update skip locked
  )
  update private.account_media_cleanup q
  set available_at = now() + interval '5 minutes'
  from batch where q.object_key = batch.object_key
  returning q.object_key;
$$;

create function public.complete_account_media_cleanup(p_object_keys text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.account_media_cleanup where object_key = any(p_object_keys);
$$;

revoke all on function public.claim_account_media_cleanup(uuid) from public, anon, authenticated;
revoke all on function public.complete_account_media_cleanup(text[]) from public, anon, authenticated;
grant execute on function public.claim_account_media_cleanup(uuid) to service_role;
grant execute on function public.complete_account_media_cleanup(text[]) to service_role;

-- Reuse the project's database-to-Edge credentials for the periodic retry.
-- An explicit account_media_cleanup_url also supports deployments without push.
create function private.request_account_media_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_url text;
  worker_secret text;
begin
  if not exists (select 1 from private.account_media_cleanup where available_at <= now()) then
    return;
  end if;

  select value into worker_url from public.app_config where key = 'account_media_cleanup_url';
  if worker_url is null then
    select pg_catalog.regexp_replace(value, '/send-push/?$', '/cleanup-account-media') into worker_url
    from public.app_config where key = 'push_function_url' and value ~ '/send-push/?$';
  end if;
  select value into worker_secret from public.app_config where key = 'push_trigger_secret';
  if worker_url is null or worker_secret is null then
    return;
  end if;

  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', worker_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end;
$$;

revoke all on function private.request_account_media_cleanup() from public, anon, authenticated;

select cron.schedule('account-media-cleanup', '*/5 * * * *', $$select private.request_account_media_cleanup()$$);
