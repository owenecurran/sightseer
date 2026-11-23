-- R2 uploads finish before this RPC. A failed database write keeps the old
-- review fields and photos intact, and retries can reuse the uploaded keys.
create function public.save_review_edit(
  p_visit_id uuid,
  p_rating numeric,
  p_note text,
  p_visited_on date,
  p_removed_photo_ids uuid[],
  p_new_photos jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  last_position integer;
begin
  update public.visits v
  set rating = p_rating, note = p_note, visited_on = p_visited_on
  where v.id = p_visit_id and v.user_id = auth.uid();

  if not found then
    raise exception 'Review unavailable' using errcode = '42501';
  end if;

  delete from public.photos p
  where p.visit_id = p_visit_id and p.id = any(p_removed_photo_ids);

  select coalesce(max(p.position), -1) into last_position
  from public.photos p where p.visit_id = p_visit_id;

  insert into public.photos (visit_id, r2_key, thumb_r2_key, width, height, position)
  select p_visit_id, photo.r2_key, photo.thumb_r2_key, photo.width, photo.height,
         last_position + input.ordinality
  from pg_catalog.jsonb_array_elements(p_new_photos) with ordinality as input(value, ordinality)
  cross join lateral pg_catalog.jsonb_to_record(input.value) as photo(
    r2_key text, thumb_r2_key text, width integer, height integer
  )
  order by input.ordinality
  on conflict (r2_key) do nothing;
end;
$$;

revoke all on function public.save_review_edit(uuid, numeric, text, date, uuid[], jsonb) from public, anon;
grant execute on function public.save_review_edit(uuid, numeric, text, date, uuid[], jsonb) to authenticated;
