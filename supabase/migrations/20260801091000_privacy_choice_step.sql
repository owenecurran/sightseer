-- Tracks whether the user has been through the new public/private choice
-- step in signup (src/app/privacy-choice.tsx). `is_private` already defaults
-- to false and can't distinguish "explicitly chose public" from "never
-- asked" — this flag is what actually gates the new onboarding step, same
-- pattern as has_shared_invite gating invite-gate.
alter table public.users
  add column has_set_privacy boolean not null default false;
