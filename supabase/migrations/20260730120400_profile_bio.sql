-- Identity chrome, same as avatar_r2_key — no RLS change needed, users_select_all
-- already exposes every column of any user's row to any signed-in caller.
alter table public.users add column bio text check (char_length(bio) <= 160);
