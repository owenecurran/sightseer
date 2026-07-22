-- Extensions
create extension if not exists postgis;
create extension if not exists pg_trgm;

-- =========================================================================
-- users
-- =========================================================================
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique,
  name text,
  is_private boolean not null default false,
  discoverable_by_contacts boolean not null default false,
  hashed_phone text,
  has_shared_invite boolean not null default false,
  invite_exempt boolean not null default false,
  created_at timestamptz not null default now()
);

create index users_hashed_phone_idx on public.users (hashed_phone)
  where hashed_phone is not null;

-- auth.users has no handle/name yet at signup time; app onboarding sets
-- handle before granting full access (checked as handle is not null).
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, created_at) values (new.id, now());
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =========================================================================
-- follows
-- =========================================================================
create table public.follows (
  follower_id uuid not null references public.users (id) on delete cascade,
  followee_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows (followee_id, status);

-- =========================================================================
-- places (hierarchical: country -> admin_area_1 -> locality -> poi/trail)
-- =========================================================================
create table public.places (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.places (id) on delete restrict,
  level text not null check (level in ('country', 'admin_area_1', 'locality', 'poi', 'trail')),
  source text not null check (source in ('google', 'osm', 'manual')),
  google_place_id text unique,
  osm_id text unique,
  name text not null,
  lat double precision,
  lng double precision,
  geog geography(Point, 4326),
  cached_at timestamptz not null default now()
);

create index places_parent_idx on public.places (parent_id);
create index places_geog_idx on public.places using gist (geog);
create index places_name_trgm_idx on public.places using gist (name gist_trgm_ops);

-- =========================================================================
-- visits (one user's review of a place, at any hierarchy level)
-- =========================================================================
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  note text,
  visited_on date not null,
  created_at timestamptz not null default now()
);

create index visits_user_idx on public.visits (user_id, created_at desc);
create index visits_place_idx on public.visits (place_id);

-- optional sub-location tags on a review (e.g. reviewing a park, tagging a trail within it)
create table public.visit_tagged_places (
  visit_id uuid not null references public.visits (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  primary key (visit_id, place_id)
);

-- =========================================================================
-- photos
-- =========================================================================
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  r2_key text not null unique,
  width integer,
  height integer,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index photos_visit_idx on public.photos (visit_id, position);

-- =========================================================================
-- boards (Pinterest-style saved collections)
-- =========================================================================
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  description text,
  cover_r2_key text,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create index boards_user_idx on public.boards (user_id);

create table public.board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  item_type text not null check (item_type in ('visit', 'photo', 'place')),
  visit_id uuid references public.visits (id) on delete cascade,
  photo_id uuid references public.photos (id) on delete cascade,
  place_id uuid references public.places (id) on delete cascade,
  note text,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  check (
    (item_type = 'visit' and visit_id is not null and photo_id is null and place_id is null) or
    (item_type = 'photo' and photo_id is not null and visit_id is null and place_id is null) or
    (item_type = 'place' and place_id is not null and visit_id is null and photo_id is null)
  )
);

create index board_items_board_idx on public.board_items (board_id, position);

-- =========================================================================
-- likes
-- =========================================================================
create table public.likes (
  user_id uuid not null references public.users (id) on delete cascade,
  visit_id uuid not null references public.visits (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, visit_id)
);

create index likes_visit_idx on public.likes (visit_id);
