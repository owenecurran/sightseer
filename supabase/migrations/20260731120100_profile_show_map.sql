-- Identity-chrome-style preference, same as bio/avatar_r2_key — no RLS
-- change needed, users_select_all already exposes every column.
alter table public.users add column show_map boolean not null default false;
