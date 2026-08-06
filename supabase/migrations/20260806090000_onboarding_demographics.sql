-- Optional demographics captured at signup, for future use (feed ranking,
-- profile prompts) — not read by any feature yet. has_set_demographics
-- gates the new onboarding step the same way has_set_privacy already gates
-- privacy-choice.tsx; true whether the user filled these in or skipped, so
-- the step never re-blocks a returning user either way.
alter table public.users
  add column home_place_id uuid references public.places (id) on delete set null,
  add column birthdate date,
  add column has_set_demographics boolean not null default false;
