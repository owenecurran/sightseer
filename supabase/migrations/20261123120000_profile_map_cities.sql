-- Profile maps show the countries, states and cities someone has been to,
-- unless they choose otherwise (Edit profile, or "Save layers" on the map).
-- The map can show cities as of this change; the old default, pins and
-- national parks, predates that.
alter table public.users
  alter column map_default_layers set default '{countries,states,cities}'::text[];

-- Accounts still on the old default move to the new one. That default was
-- set for everyone when the column was added, and nearly nobody changed it,
-- so an account still on exactly it almost certainly never chose it. Anyone
-- who did can choose it again. Delete this statement to leave existing
-- accounts as they are.
update public.users
  set map_default_layers = '{countries,states,cities}'::text[]
  where map_default_layers = '{pins,national_parks}'::text[];
