-- The photo pool the welcome screen's road draws from.
--
-- Its own table rather than a flag on `photos`, for two reasons that both
-- matter. This is read with NO SESSION -- it is the first screen a fresh
-- install shows, before anyone has signed in -- and widening `photos` to
-- anonymous reads would expose every private review's images. And a landing
-- image is a curatorial decision with its own lifecycle (added, reordered,
-- retired) that has nothing to do with the review a photo came from.
create table public.landing_images (
  id uuid primary key default gen_random_uuid(),
  -- The object in R2. Signed on demand by the get-landing-image-urls edge
  -- function; never public, so retiring a row actually retires the image.
  r2_key text not null,
  -- Set when this was promoted from a review's photo rather than uploaded
  -- directly, so the source stays traceable and the author findable. Null
  -- for an image an admin uploaded themselves.
  --
  -- ON DELETE SET NULL rather than CASCADE: if the original review is
  -- deleted the landing image does not vanish from the marketing screen
  -- mid-session, it just loses its back-reference. Whether it SHOULD be
  -- pulled is a judgement for whoever curates the pool.
  source_visit_id uuid references public.visits (id) on delete set null,
  -- Curated order. The road reads them in this order, so an admin can put
  -- the strongest image where it lands first.
  position integer not null default 0,
  added_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index landing_images_position_idx on public.landing_images (position);

alter table public.landing_images enable row level security;

-- Readable by anyone, signed out included. That is the whole point of the
-- table: the welcome screen renders before authentication.
--
-- Nothing sensitive is exposed by the row itself -- an r2_key is useless
-- without a signature, and the edge function that signs them is what
-- actually gates access.
create policy "landing_images_select_all" on public.landing_images
  for select using (true);

-- Curation is admin-only, using the same repeated is_admin subquery every
-- other admin policy in this schema uses.
create policy "landing_images_insert_admin" on public.landing_images
  for insert with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
  );

create policy "landing_images_update_admin" on public.landing_images
  for update using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
  );

create policy "landing_images_delete_admin" on public.landing_images
  for delete using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
  );
