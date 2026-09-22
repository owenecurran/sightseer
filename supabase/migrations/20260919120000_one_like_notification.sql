-- One like notification per person per review, however many times they
-- press it.
--
-- notify_like fires `after insert on public.likes` and inserted a row every
-- time. Unliking DELETES the like, so liking again is a fresh insert and a
-- fresh notification — and the pattern that produces it is the completely
-- ordinary one of tapping the heart, seeing it turn, and tapping it back.
-- Measured on production before writing this: 10 like notifications over 7
-- distinct (recipient, actor, visit) triples, so 3 of them were duplicates.
--
-- Enforced with a unique index rather than only a check inside the trigger.
-- The trigger is one writer; the index is a rule. Anything that ever inserts
-- a like notification — a backfill, a repair script, a second trigger added
-- later by someone who has not read this file — gets the same guarantee.

-- Existing duplicates have to go before the index can exist. The NEWEST of
-- each group is kept: the row's timestamp is what the list sorts on and what
-- "2h ago" is read off, and keeping the oldest would leave a re-like showing
-- a date from before it happened.
delete from public.notifications n
using public.notifications keep
where n.type = 'like'
  and keep.type = 'like'
  and n.recipient_id = keep.recipient_id
  and n.actor_id = keep.actor_id
  and n.visit_id = keep.visit_id
  and (n.created_at, n.id) < (keep.created_at, keep.id);

-- Partial, because this rule is about likes only. A person can be notified
-- about the same review more than once for different reasons — a like and a
-- comment on one visit are two things that both happened.
create unique index if not exists notifications_one_like_per_actor_visit
  on public.notifications (recipient_id, actor_id, visit_id)
  where type = 'like';

-- `on conflict do nothing` rather than a pre-check.
--
-- A `select ... if not exists` before the insert loses to itself: two likes
-- arriving together both see nothing and both insert. Letting the index
-- decide is atomic, and it is the same single statement either way.
--
-- Untargeted on purpose. A targeted `on conflict (recipient_id, actor_id,
-- visit_id) where type = 'like'` has to restate the index's predicate
-- exactly or it fails at runtime rather than at deploy, and there is no
-- other unique constraint on this table for it to swallow by accident.
create or replace function public.notify_like()
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
  values (v_owner, new.user_id, 'like', new.visit_id)
  on conflict do nothing;
  return new;
end;
$$;
