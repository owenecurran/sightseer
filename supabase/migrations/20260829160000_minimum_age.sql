-- Minimum age of 13.
--
-- A trigger rather than a CHECK constraint: the rule depends on today's
-- date, and CHECK expressions must be immutable, so `current_date` is not
-- allowed in one. A trigger is the only way to express "at least 13 years
-- before now" in the database.
--
-- Enforced server-side because the client check in demographics.tsx is an
-- affordance, not a rule — anything holding a user's token can write to this
-- column directly through PostgREST.
--
-- Safe to add as-is: no existing row is under 13 (the youngest birthdate on
-- file is 2005).
create or replace function public.enforce_minimum_age()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Null stays allowed at the database level. Rows are created by
  -- handle_new_auth_user before onboarding has asked anything, so rejecting
  -- null here would make signup itself impossible. Requiring an answer is
  -- the onboarding screen's job; this guarantees that any answer given is a
  -- valid one.
  if new.birthdate is not null and new.birthdate > current_date - interval '13 years' then
    raise exception 'Users must be at least 13 years old'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Covers UPDATE as well as INSERT: without it someone could pass the
-- onboarding check and then edit their birthdate to anything afterwards.
create trigger users_enforce_minimum_age
  before insert or update of birthdate on public.users
  for each row execute function public.enforce_minimum_age();
