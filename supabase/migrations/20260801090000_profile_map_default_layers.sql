-- Persists which layers the profile map thumbnail/modal show by default, so
-- "customize what's highlighted" (profile-map-modal.tsx's toggle chips)
-- actually sticks instead of resetting to pins-only every time. Defaults to
-- pins+national_parks (not just pins) so every existing user immediately
-- sees national park pins highlighted without configuring anything — the
-- small preview was previously structurally incapable of showing them at
-- all (see src/components/profile-map.native.tsx before this migration).
alter table public.users
  add column map_default_layers text[] not null default '{pins,national_parks}'::text[];
