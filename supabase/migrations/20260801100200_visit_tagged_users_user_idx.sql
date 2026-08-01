-- Powers the reverse "posts I'm tagged in" lookup (getVisitsTaggedIn) — the
-- table's PK is (visit_id, user_id), so `where user_id = X` had no
-- supporting index before this.
create index visit_tagged_users_user_idx on public.visit_tagged_users (user_id);
