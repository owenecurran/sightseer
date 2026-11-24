-- Live review reports have one authoritative target: the review's author.
-- Reports survive target deletion so moderators can still read the snapshot.
alter table public.reports drop constraint reports_has_target;
drop index public.reports_reporter_user_unique;

alter table public.reports
  add column target_kind text not null default 'user' check (target_kind in ('user', 'visit'));

update public.reports r
set target_kind = 'visit', reported_user_id = v.user_id
from public.visits v
where v.id = r.visit_id;

-- A historical review snapshot cannot establish who owned a deleted review.
update public.reports
set target_kind = 'visit', reported_user_id = null
where visit_id is null and snapshot_place_name is not null;

create unique index reports_reporter_user_unique
  on public.reports (reporter_id, reported_user_id)
  where target_kind = 'user' and reported_user_id is not null;

create or replace function public.snapshot_report_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  owner_id uuid;
begin
  if viewer_id is null or new.reporter_id is distinct from viewer_id then
    raise exception 'You cannot submit this report' using errcode = '42501';
  end if;

  if new.visit_id is not null then
    new.target_kind := 'visit';
    select v.user_id, p.name, coalesce(u.name, u.handle), v.rating, v.note
      into owner_id, new.snapshot_place_name, new.snapshot_author_name, new.snapshot_rating, new.snapshot_note
    from public.visits v
    join public.places p on p.id = v.place_id
    join public.users u on u.id = v.user_id
    where v.id = new.visit_id
      and v.user_id <> viewer_id
      and public.can_view_user_content(viewer_id, v.user_id);

    -- Older clients submit both IDs for a review. The author must match.
    if new.reported_user_id is not null and new.reported_user_id is distinct from owner_id then
      raise exception 'You cannot report this target' using errcode = '42501';
    end if;
  else
    new.target_kind := 'user';
    new.snapshot_place_name := null;
    new.snapshot_rating := null;
    new.snapshot_note := null;

    select u.id, coalesce(u.name, u.handle)
      into owner_id, new.snapshot_author_name
    from public.users u
    where u.id = new.reported_user_id
      and u.id <> viewer_id
      and public.can_view_user_content(viewer_id, u.id);
  end if;

  if owner_id is null then
    raise exception 'You cannot report this target' using errcode = '42501';
  end if;

  new.reported_user_id := owner_id;
  return new;
end;
$$;

revoke all on function public.snapshot_report_target() from public, anon, authenticated;

alter policy reports_insert on public.reports with check (
  auth.uid() = reporter_id
  and reported_user_id <> auth.uid()
  and public.can_view_user_content(auth.uid(), reported_user_id)
  and ((target_kind = 'visit') = (visit_id is not null))
);

alter policy reports_select on public.reports using (
  public.is_admin_user()
  or (
    auth.uid() = reporter_id
    and reported_user_id is not null
    and (target_kind = 'user' or visit_id is not null)
    and public.can_view_user_content(auth.uid(), reported_user_id)
  )
);

revoke insert, update on public.reports from public, anon, authenticated;
grant insert (reporter_id, visit_id, reported_user_id, reason, details) on public.reports to authenticated;
-- Keep status writes working for older moderation clients during rollout.
grant update (status) on public.reports to authenticated;

create function public.resolve_report(p_report_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  report public.reports%rowtype;
begin
  if not public.is_admin_user() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_action is null or p_action not in ('dismiss', 'ban_user', 'remove_visit') then
    raise exception 'Unknown report action' using errcode = '22023';
  end if;

  select * into report from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if report.status <> 'pending' then
    return;
  end if;

  if p_action = 'ban_user' then
    if report.reported_user_id is null then
      raise exception 'The reported account is no longer available' using errcode = 'P0002';
    end if;
    perform public.set_user_banned(report.reported_user_id, report.reason);
  elsif p_action = 'remove_visit' then
    if report.target_kind <> 'visit' then
      raise exception 'This report does not target a review' using errcode = '22023';
    end if;
    delete from public.visits where id = report.visit_id;
  end if;

  update public.reports
  set status = case when p_action = 'dismiss' then 'dismissed' else 'resolved' end
  where id = p_report_id;
end;
$$;

revoke all on function public.resolve_report(uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_report(uuid, text) to authenticated;
