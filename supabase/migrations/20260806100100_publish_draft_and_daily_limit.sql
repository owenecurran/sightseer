-- Single enforcement point for BOTH publishing paths (review-form.tsx's
-- direct insert for a fresh review, and publish_draft()'s insert below for
-- a resumed draft) — a client can't bypass this via any path since it's a
-- table-level trigger, not app logic. security definer + a hardcoded
-- user_id predicate: deliberately NOT built on can_view_user_content, which
-- encodes *other-viewer* visibility (blocks/follows) and has nothing to do
-- with counting a user's own recent inserts.
create function public.enforce_daily_post_limit()
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

  if recent_count >= 30 then
    raise exception 'You''ve reached today''s limit of 30 published reviews. Try again later.';
  end if;

  return new;
end;
$$;

create trigger visits_daily_post_limit
  before insert on public.visits
  for each row execute function public.enforce_daily_post_limit();

-- Publishing = insert the real visits row, re-point the draft's photos to
-- it, delete the draft — one transaction so a crash mid-way can never leave
-- a photo-less published visit next to an orphaned draft still holding the
-- photos. security definer so it can perform the visit_id re-point despite
-- no photos_update policy existing; ownership is still checked explicitly
-- below (draft_visits row must belong to auth.uid()), so this grants
-- nothing beyond "publish your own draft."
create function public.publish_draft(draft_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.draft_visits%rowtype;
  new_visit_id uuid;
begin
  select * into d from public.draft_visits where id = draft_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'Draft not found.';
  end if;
  if d.place_id is null then
    raise exception 'This draft needs a location before it can be published.';
  end if;

  insert into public.visits (user_id, place_id, rating, note, visited_on)
  values (d.user_id, d.place_id, d.rating, d.note, d.visited_on)
  returning id into new_visit_id;

  update public.photos
  set visit_id = new_visit_id, draft_visit_id = null
  where draft_visit_id = draft_id;

  delete from public.draft_visits where id = draft_id;

  return new_visit_id;
end;
$$;

grant execute on function public.publish_draft(uuid) to authenticated;
