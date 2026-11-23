create or replace function public.enforce_visit_tag_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Direct inserts and the replace operation serialize on the same visit.
  perform 1 from public.visits v where v.id = new.visit_id for no key update;
  if (select count(*) from public.visit_tags t where t.visit_id = new.visit_id) >= 3 then
    raise exception 'A review can carry at most 3 tags';
  end if;
  return new;
end;
$$;

create function public.set_visit_tags(p_visit_id uuid, p_tag_slugs text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_tag_slugs is null then
    raise exception 'Expected a list of review tags' using errcode = '22004';
  end if;

  perform 1 from public.visits v where v.id = p_visit_id and v.user_id = auth.uid() for no key update;
  if not found then
    raise exception 'Review unavailable' using errcode = '42501';
  end if;

  delete from public.visit_tags t where t.visit_id = p_visit_id;
  insert into public.visit_tags (visit_id, tag_slug)
  select distinct p_visit_id, slug from pg_catalog.unnest(p_tag_slugs) as tag(slug);
end;
$$;

revoke all on function public.set_visit_tags(uuid, text[]) from public, anon;
grant execute on function public.set_visit_tags(uuid, text[]) to authenticated;
