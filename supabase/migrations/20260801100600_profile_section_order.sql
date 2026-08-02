-- User-customizable order of the reorderable profile content modules
-- (Latest reviews / Tagged in / Prompts / Map). Nullable — unset means "use
-- the default order," parsed client-side same as map_default_layers.
alter table public.users add column profile_section_order text[];
