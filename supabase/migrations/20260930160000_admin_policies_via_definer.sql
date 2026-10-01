-- Stop RLS policies depending on the caller's column grants.
--
-- WHAT BROKE. 20260930130000 revoked table-level SELECT on public.users and
-- re-granted 14 columns. Reads of visits, visit_tagged_users and
-- profile_prompts then failed for every signed-in account with
-- "permission denied for table users" -- and nothing in any client query
-- mentions users at all.
--
-- The cause is twelve RLS policies on OTHER tables that read public.users
-- directly, as the CALLING role. The clearest is visits_select_admin:
--
--     exists (select 1 from users u where u.id = auth.uid() and u.is_admin)
--
-- Postgres evaluates EVERY policy on a table and ORs the results, so one
-- policy that cannot read users takes the whole SELECT down with it -- even
-- for an ordinary account that would never have matched the admin branch.
-- is_admin is deliberately not one of the 14 granted columns, so that EXISTS
-- raised 42501 and every read of visits failed.
--
-- The original audit looked at the policies ON users and missed the policies
-- on other tables that READ users. Worth remembering as a class: a column
-- grant is not local to the table it names.
--
-- THE FIX. One definer function, and the policies ask it instead. A policy
-- should not depend on what the caller may read -- it is the thing deciding
-- what the caller may read.
--
-- Deliberately NOT a grant of is_admin back to everybody: that column tells
-- an attacker exactly which accounts to go after, which is why it is not in
-- the public list.
--
-- follows_select also reads users, for u.is_private, and is left alone: that
-- column IS in the granted set, so it evaluates fine.

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_admin = true
  );
$$;

-- Callable by anyone: it answers only about the caller, takes no arguments,
-- and leaks nothing a caller does not already know about itself.
revoke all on function public.is_admin_user() from public, anon;
grant execute on function public.is_admin_user() to authenticated, anon;

-- ALTER rather than DROP/CREATE: there is no window where the table sits
-- without the policy, and nothing else about it changes.
alter policy "articles_delete_admin" on public.articles using (public.is_admin_user());
alter policy "articles_insert_admin" on public.articles with check (public.is_admin_user());
alter policy "articles_update_admin" on public.articles using (public.is_admin_user());
alter policy "articles_select" on public.articles
  using (published_at is not null or public.is_admin_user());

alter policy "boards_update_admin" on public.boards using (public.is_admin_user());

alter policy "landing_images_delete_admin" on public.landing_images using (public.is_admin_user());
alter policy "landing_images_insert_admin" on public.landing_images with check (public.is_admin_user());
alter policy "landing_images_update_admin" on public.landing_images using (public.is_admin_user());

alter policy "reports_update_admin" on public.reports using (public.is_admin_user());
alter policy "reports_select" on public.reports
  using (auth.uid() = reporter_id or public.is_admin_user());

alter policy "visits_delete_admin" on public.visits using (public.is_admin_user());
alter policy "visits_select_admin" on public.visits using (public.is_admin_user());
