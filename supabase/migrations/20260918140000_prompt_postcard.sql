-- A featured review shows as the postcard it actually is.
--
-- profile_prompt_attachments already carried show_note and show_rating_stamp,
-- which are options on a BESPOKE layout — review-prompt-card.tsx, a note
-- beside a photo with a rating stamp floating in the corner. That layout
-- predates the postcard. Everywhere else a review appears, it is now the card:
-- the paper, the lettering, the stamp, and the writing on the back. Featuring
-- one on a profile was the last place it came out as something else.
--
-- Default true, so this is the option a review takes unless someone turns it
-- off. Existing featured reviews become postcards on the next render, which is
-- the intent rather than a side effect — the card is what the review looks
-- like, and a profile showing a different thing was the anomaly.
--
-- show_note and show_rating_stamp are deliberately kept rather than dropped.
-- They still mean something when show_postcard is false, and a column that
-- some profiles are actively relying on is not worth deleting to save a
-- boolean.
alter table public.profile_prompt_attachments
  add column if not exists show_postcard boolean not null default true;

comment on column public.profile_prompt_attachments.show_postcard is
  'Review attachments only: draw the review as its own postcard (VisitCard) '
  'rather than the bespoke note-beside-photo layout. show_note and '
  'show_rating_stamp only apply when this is false.';
