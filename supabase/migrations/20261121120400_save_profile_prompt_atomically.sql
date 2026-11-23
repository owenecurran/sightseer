create function public.save_profile_prompt(
  p_prompt_slug text,
  p_position integer,
  p_attachments jsonb,
  p_prompt_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_prompt_id uuid;
begin
  if p_prompt_id is null then
    insert into public.profile_prompts (user_id, prompt_slug, position)
    values (auth.uid(), p_prompt_slug, p_position)
    returning id into saved_prompt_id;
  else
    -- This update locks the prompt for the duration of the replacement.
    update public.profile_prompts p
    set prompt_slug = p_prompt_slug, position = p_position
    where p.id = p_prompt_id and p.user_id = auth.uid()
    returning p.id into saved_prompt_id;

    if not found then
      raise exception 'Prompt unavailable' using errcode = '42501';
    end if;
  end if;

  delete from public.profile_prompt_attachments a where a.prompt_id = saved_prompt_id;

  insert into public.profile_prompt_attachments (
    prompt_id, position, attachment_type, text_value, photo_r2_key,
    visit_id, board_id, place_id, travel_book_id, visit_photo_id,
    cover_photo_id, display_mode, grid_photo_ids, show_note, show_rating_stamp, show_postcard
  )
  select saved_prompt_id, a.position, a.attachment_type, a.text_value, a.photo_r2_key,
    a.visit_id, a.board_id, a.place_id, a.travel_book_id, a.visit_photo_id,
    a.cover_photo_id, a.display_mode, a.grid_photo_ids,
    coalesce(a.show_note, true), coalesce(a.show_rating_stamp, true), coalesce(a.show_postcard, true)
  from pg_catalog.jsonb_to_recordset(p_attachments) as a(
    position smallint, attachment_type text, text_value text, photo_r2_key text,
    visit_id uuid, board_id uuid, place_id uuid, travel_book_id uuid, visit_photo_id uuid,
    cover_photo_id uuid, display_mode text, grid_photo_ids uuid[],
    show_note boolean, show_rating_stamp boolean, show_postcard boolean
  );
end;
$$;

revoke all on function public.save_profile_prompt(text, integer, jsonb, uuid) from public, anon;
grant execute on function public.save_profile_prompt(text, integer, jsonb, uuid) to authenticated;
