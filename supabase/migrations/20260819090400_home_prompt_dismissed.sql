-- "You've been in X a while — make it a home location?"
--
-- Needs its own flag rather than reusing trip_overrides.dismissed, which
-- means something genuinely different: `dismissed` hides the grouping
-- itself ("this isn't a trip"), whereas this only silences the suggestion
-- while leaving the trip visible. Someone who declines the prompt should
-- still see their trip grouped.
alter table public.trip_overrides
  add column home_prompt_dismissed boolean not null default false;
