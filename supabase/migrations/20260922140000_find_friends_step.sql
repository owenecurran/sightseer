-- "Find friends" becomes a step in the sign-up chain rather than a screen
-- buried in Settings.
--
-- Same shape as has_set_demographics / has_set_privacy / has_shared_invite:
-- a flag the root layout's guard reads, flipped when the step is finished OR
-- skipped. Skipping counts, deliberately — a step you can never get past is
-- a wall, and this one is entirely optional.
--
-- Why it needs to be an account flag rather than a device one, like the
-- tutorial's: what it collects (a phone hash, an uploaded phonebook) lives on
-- the account, so a reinstall should not ask again.
alter table public.users
  add column if not exists has_seen_find_friends boolean not null default false;

-- Everyone who already has an account has already been through sign-up, and
-- pushing a new step in front of 41 existing users on their next launch
-- would be a gate appearing out of nowhere. They can reach it from Settings,
-- which is where it has always been.
update public.users set has_seen_find_friends = true where handle is not null;
