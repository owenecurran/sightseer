import { resolveStateCountries } from '@/lib/places-cache';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type BoardRow = Database['public']['Tables']['boards']['Row'];
type BoardUpdate = Database['public']['Tables']['boards']['Update'];

type PlaceWithLatLng = { name: string; lat: number | null; lng: number | null };

export async function listMyBoards(userId: string): Promise<BoardRow[]> {
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createBoard(params: {
  userId: string;
  name: string;
  isPrivate?: boolean;
  listStyle?: 'collection' | 'ranked';
}): Promise<BoardRow> {
  const { data, error } = await supabase
    .from('boards')
    .insert({
      user_id: params.userId,
      name: params.name,
      is_private: params.isPrivate ?? false,
      list_style: params.listStyle ?? 'collection',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Which of the given board ids already contain this visit — used to render
// save/saved state per board. Takes board ids rather than a user id so
// callers reuse the board list they already fetched instead of a second join.
export async function getBoardIdsContainingVisit(
  boardIds: string[],
  visitId: string
): Promise<Set<string>> {
  if (boardIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('board_items')
    .select('board_id')
    .eq('visit_id', visitId)
    .in('board_id', boardIds);
  if (error) throw error;
  return new Set(data.map((row) => row.board_id));
}

export async function saveVisitToBoard(boardId: string, visitId: string): Promise<void> {
  const { error } = await supabase
    .from('board_items')
    .insert({ board_id: boardId, item_type: 'visit', visit_id: visitId });
  if (error) throw error;
}

// Drag-to-reorder persistence, mirroring reorderPrompts in
// src/lib/profile-prompts.ts exactly — sequential per-row updates against
// board_items.position (already indexed via board_items_board_idx).
export async function reorderBoardItems(orderedItemIds: string[]): Promise<void> {
  for (let position = 0; position < orderedItemIds.length; position++) {
    const { error } = await supabase.from('board_items').update({ position }).eq('id', orderedItemIds[position]);
    if (error) throw error;
  }
}

// Cover is picked from an existing item photo already saved to the board —
// no upload, just a reference — so board owners can set it directly from
// whatever's already there.
export async function setBoardCoverPhoto(boardId: string, photoId: string): Promise<void> {
  const { error } = await supabase.from('boards').update({ cover_photo_id: photoId }).eq('id', boardId);
  if (error) throw error;
}

export async function removeVisitFromBoard(boardId: string, visitId: string): Promise<void> {
  const { error } = await supabase
    .from('board_items')
    .delete()
    .eq('board_id', boardId)
    .eq('visit_id', visitId);
  if (error) throw error;
}

type LatestPhotoRow = {
  board_id: string;
  added_at: string;
  visits: { photos: { id: string; position: number }[] } | null;
};

// "Most recently added" = most recent board_items.added_at (when it was
// saved to *this* board), not the underlying visit's own date — powers the
// boards list row thumbnail.
export async function getLatestReviewPhotoIds(boardIds: string[]): Promise<Record<string, string>> {
  if (boardIds.length === 0) return {};
  const { data, error } = await supabase
    .from('board_items')
    .select('board_id, added_at, visits(photos(id, position))')
    .in('board_id', boardIds)
    .eq('item_type', 'visit')
    .order('added_at', { ascending: false });
  if (error) throw error;

  const result: Record<string, string> = {};
  for (const row of data as unknown as LatestPhotoRow[]) {
    if (result[row.board_id]) continue; // already-seen board_id wins (sorted desc)
    const firstPhoto = [...(row.visits?.photos ?? [])].sort((a, b) => a.position - b.position)[0];
    if (firstPhoto) result[row.board_id] = firstPhoto.id;
  }
  return result;
}

export type BoardVisitItem = {
  kind: 'visit';
  id: string;
  visitId: string;
  addedAt: string;
  rating: number | null;
  note: string | null;
  visitedOn: string;
  authorId: string;
  authorName: string;
  placeId: string;
  placeName: string;
  stateCountry: string | null;
  placeLat: number | null;
  placeLng: number | null;
  photoIds: string[];
  photoAspectRatios: (number | null)[];
};

// A bare place saved to a board with no review — see savePlaceToBoard.
// Deliberately a separate, much narrower shape rather than a BoardVisitItem
// with nulled-out visit fields: there's no rating/note/photos/author to
// fake, and every view that needs those (full reviews, images, map) simply
// doesn't render place-only items rather than pretending they have content
// they don't.
export type BoardPlaceItem = {
  kind: 'place';
  id: string;
  placeId: string;
  addedAt: string;
  placeName: string;
  stateCountry: string | null;
  placeLat: number | null;
  placeLng: number | null;
};

export type BoardItem = BoardVisitItem | BoardPlaceItem;

type BoardItemRow = {
  id: string;
  item_type: 'visit' | 'photo' | 'place';
  visit_id: string | null;
  place_id: string | null;
  added_at: string;
  visits: {
    rating: number | null;
    note: string | null;
    visited_on: string;
    user_id: string;
    place_id: string;
    users: { handle: string | null; name: string | null } | null;
    places: PlaceWithLatLng | null;
    photos: { id: string; position: number; width: number | null; height: number | null }[];
  } | null;
  places: PlaceWithLatLng | null;
};

function sortedPhotoAspectRatios(photos: { position: number; width: number | null; height: number | null }[]) {
  return [...photos]
    .sort((a, b) => a.position - b.position)
    .map((p) => (p.width && p.height ? p.width / p.height : null));
}

// Feeds all board-detail view modes — replaces the inline query that used
// to live directly in board/[id].tsx. Returns both visit-backed and
// place-only rows (in position order, for ranked/list views); callers that
// need only visit-backed items (full reviews, images, map — anything
// needing rating/photos) should filter with `item.kind === 'visit'`.
export async function getBoardItems(boardId: string): Promise<BoardItem[]> {
  const { data, error } = await supabase
    .from('board_items')
    .select(
      'id, item_type, visit_id, place_id, added_at, visits(rating, note, visited_on, user_id, place_id, users!user_id(handle, name), places!place_id(name, lat, lng), photos(id, position, width, height)), places!place_id(name, lat, lng)'
    )
    .eq('board_id', boardId)
    .in('item_type', ['visit', 'place'])
    .order('position');
  if (error) throw error;

  const rows = data as unknown as BoardItemRow[];
  const allPlaceIds = rows
    .map((row) => (row.item_type === 'visit' ? row.visits?.place_id : row.place_id))
    .filter((id): id is string => id != null);
  const stateCountryMap = await resolveStateCountries(allPlaceIds);

  const items: BoardItem[] = [];
  for (const row of rows) {
    if (row.item_type === 'visit' && row.visits) {
      items.push({
        kind: 'visit',
        id: row.id,
        visitId: row.visit_id!,
        addedAt: row.added_at,
        rating: row.visits.rating,
        note: row.visits.note,
        visitedOn: row.visits.visited_on,
        authorId: row.visits.user_id,
        authorName: row.visits.users?.name ?? row.visits.users?.handle ?? 'Someone',
        placeId: row.visits.place_id,
        placeName: row.visits.places?.name ?? 'Unknown place',
        stateCountry: stateCountryMap.get(row.visits.place_id) ?? null,
        placeLat: row.visits.places?.lat ?? null,
        placeLng: row.visits.places?.lng ?? null,
        photoIds: [...row.visits.photos].sort((a, b) => a.position - b.position).map((p) => p.id),
        photoAspectRatios: sortedPhotoAspectRatios(row.visits.photos),
      });
    } else if (row.item_type === 'place' && row.places) {
      items.push({
        kind: 'place',
        id: row.id,
        placeId: row.place_id!,
        addedAt: row.added_at,
        placeName: row.places.name,
        stateCountry: stateCountryMap.get(row.place_id!) ?? null,
        placeLat: row.places.lat,
        placeLng: row.places.lng,
      });
    }
  }
  return items;
}

type OwnVisitRow = {
  id: string;
  rating: number | null;
  note: string | null;
  visited_on: string;
  created_at: string;
  user_id: string;
  place_id: string;
  users: { handle: string | null; name: string | null } | null;
  places: PlaceWithLatLng | null;
  photos: { id: string; position: number; width: number | null; height: number | null }[];
};

// Same BoardVisitItem shape as getBoardItems, so reviews.tsx can reuse the
// board-detail view-mode components unmodified. No board_items join — id
// equals visitId here since there's no wrapping join row for a user's own
// visits.
export async function getMyVisitItems(userId: string): Promise<BoardVisitItem[]> {
  const { data, error } = await supabase
    .from('visits')
    .select(
      'id, rating, note, visited_on, created_at, user_id, place_id, users!user_id(handle, name), places!place_id(name, lat, lng), photos(id, position, width, height)'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data as unknown as OwnVisitRow[];
  const stateCountryMap = await resolveStateCountries(rows.map((row) => row.place_id));
  return rows.map((row) => ({
    kind: 'visit' as const,
    id: row.id,
    visitId: row.id,
    addedAt: row.created_at,
    rating: row.rating,
    note: row.note,
    visitedOn: row.visited_on,
    authorId: row.user_id,
    authorName: row.users?.name ?? row.users?.handle ?? 'Someone',
    placeId: row.place_id,
    placeName: row.places?.name ?? 'Unknown place',
    stateCountry: stateCountryMap.get(row.place_id) ?? null,
    placeLat: row.places?.lat ?? null,
    placeLng: row.places?.lng ?? null,
    photoIds: [...row.photos].sort((a, b) => a.position - b.position).map((p) => p.id),
    photoAspectRatios: sortedPhotoAspectRatios(row.photos),
  }));
}

// Private per-user progress checklist — never visible to the board owner or
// anyone else, see 20260804100000_item_check_lists.sql. Existence of a row
// means checked; there's no separate boolean column.
export async function getMyCheckedItemIds(userId: string, boardId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('board_item_checks')
    .select('board_item_id')
    .eq('user_id', userId)
    .eq('board_id', boardId);
  if (error) throw error;
  return new Set(data.map((row) => row.board_item_id));
}

export async function checkBoardItem(userId: string, boardId: string, boardItemId: string): Promise<void> {
  const { error } = await supabase
    .from('board_item_checks')
    .insert({ user_id: userId, board_id: boardId, board_item_id: boardItemId });
  if (error) throw error;
}

export async function uncheckBoardItem(userId: string, boardItemId: string): Promise<void> {
  const { error } = await supabase
    .from('board_item_checks')
    .delete()
    .eq('user_id', userId)
    .eq('board_item_id', boardItemId);
  if (error) throw error;
}

// A bare .update() with no .select() would silently "succeed" even if RLS
// matched zero rows (PostgREST returns no error for that — it just means
// nothing was written) — the caller couldn't tell "updated" from "silently
// no-op'd due to a permission mismatch." Appending .select('id') and
// checking the returned row count turns that into a real, thrown error.
// Matters most for setBoardFeatured below (an admin writing to a row they
// don't own — a genuine permission boundary, not just "is this my own
// row"), but applied to all three here since they share the same shape.
async function updateBoardOrThrow(boardId: string, patch: BoardUpdate, failureMessage: string): Promise<void> {
  const { data, error } = await supabase.from('boards').update(patch).eq('id', boardId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(failureMessage);
}

// Board settings — see board/[id]/settings.tsx. Both columns already existed
// (20260803120200_travel_book_rating_and_board_list_style.sql) but were
// never writable from the app until now.
export async function updateBoardListStyle(boardId: string, listStyle: 'collection' | 'ranked'): Promise<void> {
  await updateBoardOrThrow(boardId, { list_style: listStyle }, 'Could not update the ranking type.');
}

export async function updateBoardPrivacy(boardId: string, isPrivate: boolean): Promise<void> {
  await updateBoardOrThrow(boardId, { is_private: isPrivate }, 'Could not update privacy.');
}

// Admin-only in practice — authorized by the additive boards_update_admin
// RLS policy (full-row grant, same trust model as visits_delete_admin),
// not by anything this function checks client-side.
export async function setBoardFeatured(boardId: string, featured: boolean): Promise<void> {
  await updateBoardOrThrow(boardId, { is_featured: featured }, 'Could not update featured status — you may not have permission.');
}

// No RPC needed — boards_select RLS already scopes results correctly per
// caller (a featured-but-private board still only shows to its owner).
export async function listFeaturedBoards(limit = 5): Promise<BoardRow[]> {
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('is_featured', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
