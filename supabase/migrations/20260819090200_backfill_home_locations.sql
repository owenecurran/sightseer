-- Onboarding has captured a single hometown (users.home_place_id) since
-- 20260806090000, but nothing ever read it — that migration's own comment
-- says as much ("not read by any feature yet"). home_locations is now the
-- real thing it was standing in for, so every hometown already collected
-- becomes a home location, and trip detection starts working for existing
-- users without them having to re-enter something they already told us.
--
-- on conflict do nothing: home_locations has a (user_id, place_id) unique
-- constraint, and anyone who already added the same city by hand on the new
-- screen should keep their existing row rather than have this fail.
insert into public.home_locations (user_id, place_id)
select u.id, u.home_place_id
from public.users u
where u.home_place_id is not null
on conflict (user_id, place_id) do nothing;

-- users.home_place_id deliberately survives this: it stays the "hometown"
-- demographic it was introduced as (a single place someone is *from*),
-- which isn't the same question as "which places should count as home for
-- trip detection" (up to 5, changeable, and about where you currently are).
-- Onboarding now writes both — see demographics.tsx.
