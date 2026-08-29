-- Descriptive tags on a review ("Perfect sunset", "Local secret"), so people
-- can sift places by what they actually want from them.
--
-- NAMING: `visit_tagged_users` and `visit_tagged_places` already exist and
-- mean something different — those link a visit to another ROW (a person, a
-- specific spot). This is a controlled vocabulary of descriptions, hence
-- `tags` (nouns from a fixed list) rather than `tagged_<entity>`.
--
-- A table rather than an enum so the vocabulary can grow with a plain insert
-- instead of an ALTER TYPE, and so each tag can carry its own display label
-- and ordering without the client hardcoding a parallel copy.
create table public.tags (
  slug text primary key,
  label text not null,
  -- Groups related tags together in the picker without imposing a rigid
  -- category system; purely presentational.
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tags enable row level security;

-- The vocabulary is public to every signed-in user and writable by nobody
-- through the API: new tags arrive by migration, which is what keeps this a
-- controlled vocabulary rather than drifting into free-form text where
-- "kid friendly" and "Kid-Friendly" are different filters.
create policy "tags_select" on public.tags for select using (auth.uid() is not null);

create table public.visit_tags (
  visit_id uuid not null references public.visits (id) on delete cascade,
  tag_slug text not null references public.tags (slug) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (visit_id, tag_slug)
);

-- The PK covers visit -> tags. This is the other direction: "every review
-- tagged 'local-secret'", which is the whole point of the feature.
create index visit_tags_tag_idx on public.visit_tags (tag_slug);

alter table public.visit_tags enable row level security;

-- Same visibility rule as visit_tagged_users: a tag is visible exactly when
-- the review it describes is.
create policy "visit_tags_select" on public.visit_tags
  for select using (
    exists (
      select 1 from public.visits v
      where v.id = visit_tags.visit_id
        and public.can_view_user_content(auth.uid(), v.user_id)
    )
  );

-- Only the review's author describes their own review. Unlike
-- visit_tagged_users there is no "remove yourself" case here, so both write
-- policies are simply ownership.
create policy "visit_tags_insert_own_visit" on public.visit_tags
  for insert with check (
    exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid())
  );

create policy "visit_tags_delete_own_visit" on public.visit_tags
  for delete using (
    exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid())
  );

-- Three tags maximum. Enforced here rather than only in the client because
-- the client's limit is a UI affordance and this is the actual rule — the
-- table is writable directly through PostgREST by the review's owner.
--
-- Keep in sync with MAX_VISIT_TAGS in src/lib/visit-tags.ts.
create or replace function public.enforce_visit_tag_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Not race-proof under genuinely concurrent inserts, which would need a
  -- lock on the parent visit. Deliberate: the only writer is the review's
  -- own author, so the realistic failure mode is a double-tap, and the
  -- primary key already rejects that.
  if (select count(*) from public.visit_tags where visit_id = new.visit_id) >= 3 then
    raise exception 'A review can carry at most 3 tags';
  end if;
  return new;
end;
$$;

create trigger visit_tags_enforce_limit
  before insert on public.visit_tags
  for each row execute function public.enforce_visit_tag_limit();

-- The starting vocabulary. sort_order groups them loosely — atmosphere,
-- who it suits, cost, what's there, how it rates — so the picker doesn't
-- read as an arbitrary pile.
insert into public.tags (slug, label, sort_order) values
  ('perfect-sunset',        'Perfect sunset',        10),
  ('scenic-location',       'Scenic location',       20),
  ('open-water',            'Open water',            30),
  ('great-trails',          'Great trails',          40),
  ('walkable',              'Walkable',              50),
  ('vibe',                  'Vibe',                  60),
  ('cozy',                  'Cozy',                  70),
  ('live-music',            'Live music',            80),
  ('bar',                   'Bar',                   90),
  ('night-out',             'Night out',            100),
  ('young-people',          'Young people',         110),
  ('kid-friendly',          'Kid-friendly',         120),
  ('pet-friendly',          'Pet-friendly',         130),
  ('affordable',            'Affordable',           140),
  ('high-end',              'High-end',             150),
  ('local-secret',          'Local secret',         160),
  ('highlight-of-the-city', 'Highlight of the city', 170);
