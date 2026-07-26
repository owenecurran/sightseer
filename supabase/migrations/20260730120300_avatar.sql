-- Same private-R2-bucket + presigned-URL architecture as visit photos
-- (r2_key, not a public URL) — see create-avatar-upload-url/get-avatar-urls
-- Edge Functions. No RLS change needed: users_select_all already exposes
-- every column of a user's row to any signed-in caller, and users_update_own
-- already lets a user write any column on their own row.
alter table public.users add column avatar_r2_key text;
