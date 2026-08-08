-- Two additions: a 'place' attachment can now optionally carry a photo
-- alongside it (previously photo_r2_key was hard-forbidden for this type —
-- a location prompt answer had no visual at all), and a 'review' attachment
-- can now explicitly pick WHICH of the visit's photos to feature instead of
-- always silently defaulting to the first one by position.
alter table public.profile_prompt_attachments
  drop constraint profile_prompt_attachments_check;

alter table public.profile_prompt_attachments
  add constraint profile_prompt_attachments_check check (
    (attachment_type = 'text' and text_value is not null and photo_r2_key is null and visit_id is null and board_id is null and place_id is null and travel_book_id is null)
    or (attachment_type = 'photo' and photo_r2_key is not null and text_value is null and visit_id is null and board_id is null and place_id is null and travel_book_id is null)
    or (attachment_type = 'review' and visit_id is not null and text_value is null and photo_r2_key is null and board_id is null and place_id is null and travel_book_id is null)
    or (attachment_type = 'board' and board_id is not null and text_value is null and photo_r2_key is null and visit_id is null and place_id is null and travel_book_id is null)
    -- photo_r2_key is now optional (no longer forced null) for 'place'.
    or (attachment_type = 'place' and place_id is not null and text_value is null and visit_id is null and board_id is null and travel_book_id is null)
    or (attachment_type = 'travel_book' and travel_book_id is not null and text_value is null and photo_r2_key is null and visit_id is null and board_id is null and place_id is null)
  );

-- Null = keep today's default (first photo by position); set = an explicit
-- override. No ownership/consistency trigger needed — the client only ever
-- offers photos belonging to whatever visit_id was already chosen, and
-- photos_select's own RLS still governs actual visibility either way.
alter table public.profile_prompt_attachments
  add column visit_photo_id uuid references public.photos (id) on delete set null;
