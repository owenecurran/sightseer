-- Shared visibility rule: can `viewer_id` see content owned by `owner_id`?
-- Owner sees their own content; everyone sees public accounts' content;
-- followers see private accounts' content once the follow is accepted.
-- security definer + fixed search_path: avoids RLS recursion when this is
-- called from inside another table's policy, and blocks search_path hijacking.
create function public.can_view_user_content(viewer_id uuid, owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    viewer_id = owner_id
    or exists (
      select 1 from public.users u
      where u.id = owner_id and u.is_private = false
    )
    or exists (
      select 1 from public.follows f
      where f.follower_id = viewer_id
        and f.followee_id = owner_id
        and f.status = 'accepted'
    );
$$;

alter table public.users enable row level security;
alter table public.follows enable row level security;
alter table public.places enable row level security;
alter table public.visits enable row level security;
alter table public.visit_tagged_places enable row level security;
alter table public.photos enable row level security;
alter table public.boards enable row level security;
alter table public.board_items enable row level security;
alter table public.likes enable row level security;

-- ---------------------------------------------------------------------
-- users: profile shell (handle/name/privacy flag) is always visible;
-- actual content visibility is enforced per-table below.
-- ---------------------------------------------------------------------
create policy "users_select_all" on public.users
  for select using (true);

create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- insert happens via the handle_new_auth_user trigger (security definer),
-- not directly by clients; no insert policy needed.

-- ---------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------
create policy "follows_select" on public.follows
  for select using (
    auth.uid() = follower_id
    or auth.uid() = followee_id
    or exists (select 1 from public.users u where u.id = followee_id and u.is_private = false)
  );

create policy "follows_insert_own" on public.follows
  for insert with check (auth.uid() = follower_id);

create policy "follows_update_followee" on public.follows
  for update using (auth.uid() = followee_id);

create policy "follows_delete_participant" on public.follows
  for delete using (auth.uid() = follower_id or auth.uid() = followee_id);

-- ---------------------------------------------------------------------
-- places: shared reference data, cached from Google/OSM or entered manually
-- ---------------------------------------------------------------------
create policy "places_select_all" on public.places
  for select using (true);

create policy "places_insert_authenticated" on public.places
  for insert with check (auth.uid() is not null);

-- no update/delete policy: places are append-only from the client;
-- corrections happen server-side (service role) only.

-- ---------------------------------------------------------------------
-- visits
-- ---------------------------------------------------------------------
create policy "visits_select" on public.visits
  for select using (public.can_view_user_content(auth.uid(), user_id));

create policy "visits_insert_own" on public.visits
  for insert with check (auth.uid() = user_id);

create policy "visits_update_own" on public.visits
  for update using (auth.uid() = user_id);

create policy "visits_delete_own" on public.visits
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- visit_tagged_places: follows the parent visit's visibility/ownership
-- ---------------------------------------------------------------------
create policy "visit_tagged_places_select" on public.visit_tagged_places
  for select using (
    exists (
      select 1 from public.visits v
      where v.id = visit_tagged_places.visit_id
        and public.can_view_user_content(auth.uid(), v.user_id)
    )
  );

create policy "visit_tagged_places_insert_own" on public.visit_tagged_places
  for insert with check (
    exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid())
  );

create policy "visit_tagged_places_delete_own" on public.visit_tagged_places
  for delete using (
    exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- photos: follows the parent visit's visibility/ownership
-- ---------------------------------------------------------------------
create policy "photos_select" on public.photos
  for select using (
    exists (
      select 1 from public.visits v
      where v.id = photos.visit_id
        and public.can_view_user_content(auth.uid(), v.user_id)
    )
  );

create policy "photos_insert_own" on public.photos
  for insert with check (
    exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid())
  );

create policy "photos_delete_own" on public.photos
  for delete using (
    exists (select 1 from public.visits v where v.id = visit_id and v.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- boards: a private board is owner-only regardless of follow status;
-- a non-private board follows the normal account-visibility rule.
-- ---------------------------------------------------------------------
create policy "boards_select" on public.boards
  for select using (
    auth.uid() = user_id
    or (is_private = false and public.can_view_user_content(auth.uid(), user_id))
  );

create policy "boards_insert_own" on public.boards
  for insert with check (auth.uid() = user_id);

create policy "boards_update_own" on public.boards
  for update using (auth.uid() = user_id);

create policy "boards_delete_own" on public.boards
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- board_items: visible only if BOTH the board and the underlying saved
-- content are currently visible to the viewer (checked live, not
-- snapshotted at save time — losing access to either hides the item).
-- ---------------------------------------------------------------------
create policy "board_items_select" on public.board_items
  for select using (
    exists (
      select 1 from public.boards b
      where b.id = board_items.board_id
        and (b.user_id = auth.uid() or (b.is_private = false and public.can_view_user_content(auth.uid(), b.user_id)))
    )
    and (
      (item_type = 'place')
      or (item_type = 'visit' and exists (
        select 1 from public.visits v
        where v.id = board_items.visit_id and public.can_view_user_content(auth.uid(), v.user_id)
      ))
      or (item_type = 'photo' and exists (
        select 1 from public.photos p
        join public.visits v on v.id = p.visit_id
        where p.id = board_items.photo_id and public.can_view_user_content(auth.uid(), v.user_id)
      ))
    )
  );

create policy "board_items_insert_own" on public.board_items
  for insert with check (
    exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
    and (
      (item_type = 'place')
      or (item_type = 'visit' and exists (
        select 1 from public.visits v
        where v.id = visit_id and public.can_view_user_content(auth.uid(), v.user_id)
      ))
      or (item_type = 'photo' and exists (
        select 1 from public.photos p
        join public.visits v on v.id = p.visit_id
        where p.id = photo_id and public.can_view_user_content(auth.uid(), v.user_id)
      ))
    )
  );

create policy "board_items_delete_own" on public.board_items
  for delete using (
    exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- likes: can only like/see likes on content you can view
-- ---------------------------------------------------------------------
create policy "likes_select" on public.likes
  for select using (
    exists (
      select 1 from public.visits v
      where v.id = likes.visit_id and public.can_view_user_content(auth.uid(), v.user_id)
    )
  );

create policy "likes_insert_own" on public.likes
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.visits v
      where v.id = visit_id and public.can_view_user_content(auth.uid(), v.user_id)
    )
  );

create policy "likes_delete_own" on public.likes
  for delete using (auth.uid() = user_id);
