import { mapRawFeedVisit, type RawFeedVisit } from '@/lib/feed';
import { resolveStateCountries } from '@/lib/places-cache';
import { getVisitsTaggedIn, type TaggedVisit } from '@/lib/tagged-visits';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type TravelBookRow = Database['public']['Tables']['travel_books']['Row'];

export type TravelBookListItem = TravelBookRow & { locationName: string | null };

type TravelBookWithPlace = TravelBookRow & { places: { name: string } | null };

export async function listMyTravelBooks(userId: string): Promise<TravelBookListItem[]> {
  const { data: collab, error: collabError } = await supabase
    .from('travel_book_collaborators')
    .select('travel_book_id')
    .eq('user_id', userId);
  if (collabError) throw collabError;

  const collabIds = collab.map((c) => c.travel_book_id);
  const filter = collabIds.length > 0 ? `user_id.eq.${userId},id.in.(${collabIds.join(',')})` : `user_id.eq.${userId}`;

  const { data, error } = await supabase
    .from('travel_books')
    .select('*, places!location_place_id(name)')
    .or(filter)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data as unknown as TravelBookWithPlace[]).map(({ places, ...book }) => ({
    ...book,
    locationName: places?.name ?? null,
  }));
}

// Travel books owned by `userId`, for browsing someone else's collections
// from their profile — unlike listMyTravelBooks, deliberately excludes the
// *viewing* session's own collaborator books (not relevant when userId is
// someone else's profile). RLS (travel_books_select) still restricts
// results to whatever's actually visible to the viewer.
export async function listUserTravelBooks(userId: string): Promise<TravelBookListItem[]> {
  const { data, error } = await supabase
    .from('travel_books')
    .select('*, places!location_place_id(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data as unknown as TravelBookWithPlace[]).map(({ places, ...book }) => ({
    ...book,
    locationName: places?.name ?? null,
  }));
}

export async function createTravelBook(params: {
  userId: string;
  title: string;
  description?: string;
  isPrivate?: boolean;
  locationPlaceId?: string | null;
}): Promise<TravelBookRow> {
  const { data, error } = await supabase
    .from('travel_books')
    .insert({
      user_id: params.userId,
      title: params.title,
      description: params.description || null,
      is_private: params.isPrivate ?? false,
      location_place_id: params.locationPlaceId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Cover is picked from an existing item photo already in the book — no
// upload, just a reference, same as boards' setBoardCoverPhoto.
export async function setTravelBookCoverPhoto(bookId: string, photoId: string): Promise<void> {
  const { error } = await supabase.from('travel_books').update({ cover_photo_id: photoId }).eq('id', bookId);
  if (error) throw error;
}

// One editable-any-time rating for the trip itself, distinct from
// travel_book_recaps.rating (a separate "trip recap" write-up concept).
// Nullable column, no history — setting it again just overwrites.
export async function setTravelBookRating(bookId: string, rating: number | null): Promise<void> {
  const { error } = await supabase.from('travel_books').update({ rating }).eq('id', bookId);
  if (error) throw error;
}

// location_place_id is set at creation time in travel-book/new.tsx; this is
// the edit-after-the-fact path.
export async function setTravelBookLocation(bookId: string, placeId: string | null): Promise<void> {
  const { error } = await supabase.from('travel_books').update({ location_place_id: placeId }).eq('id', bookId);
  if (error) throw error;
}

export type TravelBookCollaborator = { userId: string; name: string };

export async function getTravelBookDetail(
  bookId: string
): Promise<{ book: TravelBookRow; locationName: string | null; collaborators: TravelBookCollaborator[] }> {
  const [{ data: bookData, error: bookError }, { data: collabRows, error: collabError }] = await Promise.all([
    supabase.from('travel_books').select('*, places!location_place_id(name)').eq('id', bookId).single(),
    supabase.from('travel_book_collaborators').select('user_id, users!user_id(name, handle)').eq('travel_book_id', bookId),
  ]);
  if (bookError) throw bookError;
  if (collabError) throw collabError;

  const { places, ...book } = bookData as unknown as TravelBookWithPlace;
  const rows = collabRows as unknown as { user_id: string; users: { name: string | null; handle: string | null } | null }[];
  return {
    book,
    locationName: places?.name ?? null,
    collaborators: rows.map((row) => ({
      userId: row.user_id,
      name: row.users?.name ?? row.users?.handle ?? 'Someone',
    })),
  };
}

export async function addCollaborator(bookId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('travel_book_collaborators')
    .insert({ travel_book_id: bookId, user_id: userId });
  if (error) throw error;
}

export async function removeCollaborator(bookId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('travel_book_collaborators')
    .delete()
    .eq('travel_book_id', bookId)
    .eq('user_id', userId);
  if (error) throw error;
}

export type TravelBookVisitItem = TaggedVisit & { kind: 'visit'; itemId: string; addedBy: string; addedAt: string };

// A bare place added to the trip with no review — see addPlaceToTravelBook.
// Deliberately its own narrow shape rather than a TravelBookVisitItem with
// nulled-out visit fields, same reasoning as BoardPlaceItem in boards.ts.
export type TravelBookPlaceItem = {
  kind: 'place';
  itemId: string;
  placeId: string;
  placeName: string;
  stateCountry: string | null;
  addedBy: string;
  addedAt: string;
};

export type TravelBookItem = TravelBookVisitItem | TravelBookPlaceItem;

export async function getTravelBookItems(bookId: string, viewerId: string): Promise<TravelBookItem[]> {
  const { data, error } = await supabase
    .from('travel_book_items')
    .select(
      'id, item_type, place_id, added_by, added_at, visits(id, rating, note, visited_on, created_at, user_id, place_id, users!user_id(handle, name), places!place_id(name), photos(id, position, width, height), likes(user_id), visit_tagged_users(user_id, users(handle, name)), visit_tagged_places(places(name, category)), comments(id)), places!place_id(name)'
    )
    .eq('travel_book_id', bookId);
  if (error) throw error;

  type Row = {
    id: string;
    item_type: 'visit' | 'place';
    place_id: string | null;
    added_by: string;
    added_at: string;
    visits: RawFeedVisit | null;
    places: { name: string } | null;
  };
  const rows = data as unknown as Row[];

  const allPlaceIds = rows
    .map((row) => (row.item_type === 'visit' ? row.visits?.place_id : row.place_id))
    .filter((id): id is string => id != null);
  const stateCountryMap = await resolveStateCountries(allPlaceIds);

  const items: TravelBookItem[] = [];
  for (const row of rows) {
    if (row.item_type === 'visit' && row.visits) {
      items.push({
        ...mapRawFeedVisit(row.visits, viewerId, stateCountryMap),
        kind: 'visit',
        itemId: row.id,
        addedBy: row.added_by,
        addedAt: row.added_at,
      });
    } else if (row.item_type === 'place' && row.places && row.place_id) {
      items.push({
        kind: 'place',
        itemId: row.id,
        placeId: row.place_id,
        placeName: row.places.name,
        stateCountry: stateCountryMap.get(row.place_id) ?? null,
        addedBy: row.added_by,
        addedAt: row.added_at,
      });
    }
  }
  return items.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

export async function getVisitIdsInTravelBook(bookId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('travel_book_items').select('visit_id').eq('travel_book_id', bookId);
  if (error) throw error;
  // visit_id is null for place-only items (added in the place-support
  // migration) — irrelevant here, this set is only used to dedupe against
  // visit-backed eligibility.
  return new Set(data.map((row) => row.visit_id).filter((id): id is string => id != null));
}

// Own visits + visits tagged in, deduped, minus what's already in the book —
// exactly the eligibility rule travel_book_items' insert RLS also enforces.
export async function getEligibleVisitsForTravelBook(userId: string, bookId: string): Promise<TaggedVisit[]> {
  const [ownVisits, taggedVisits, alreadyInBook] = await Promise.all([
    getOwnVisitsAsTaggedVisit(userId),
    getVisitsTaggedIn(userId),
    getVisitIdsInTravelBook(bookId),
  ]);

  const byId = new Map<string, TaggedVisit>();
  for (const visit of [...ownVisits, ...taggedVisits]) {
    if (!alreadyInBook.has(visit.id)) byId.set(visit.id, visit);
  }
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function getOwnVisitsAsTaggedVisit(userId: string): Promise<TaggedVisit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select(
      'id, rating, note, visited_on, created_at, user_id, place_id, users!user_id(handle, name), places!place_id(name), photos(id, position, width, height), likes(user_id), visit_tagged_users(user_id, users(handle, name)), visit_tagged_places(places(name, category)), comments(id)'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as RawFeedVisit[]).map((visit) => mapRawFeedVisit(visit, userId));
}

export async function addVisitToTravelBook(bookId: string, visitId: string, addedBy: string): Promise<void> {
  const { error } = await supabase
    .from('travel_book_items')
    .insert({ travel_book_id: bookId, visit_id: visitId, added_by: addedBy });
  if (error) throw error;
}

export async function removeVisitFromTravelBook(itemId: string): Promise<void> {
  const { error } = await supabase.from('travel_book_items').delete().eq('id', itemId);
  if (error) throw error;
}

// Mirrors boards.ts's getBoardIdsContainingVisit — which of the given
// travel-book ids already contain this visit, for the feed "+" menu's
// save/saved toggle state.
export async function getTravelBookIdsContainingVisit(
  bookIds: string[],
  visitId: string
): Promise<Set<string>> {
  if (bookIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('travel_book_items')
    .select('travel_book_id')
    .eq('visit_id', visitId)
    .in('travel_book_id', bookIds);
  if (error) throw error;
  return new Set(data.map((row) => row.travel_book_id));
}

// Mirrors boards.ts's removeVisitFromBoard.
export async function removeVisitFromTravelBookByVisit(bookId: string, visitId: string): Promise<void> {
  const { error } = await supabase
    .from('travel_book_items')
    .delete()
    .eq('travel_book_id', bookId)
    .eq('visit_id', visitId);
  if (error) throw error;
}

// Private per-user progress checklist, mirrors boards.ts's
// getMyCheckedItemIds/checkBoardItem/uncheckBoardItem — see
// 20260804100000_item_check_lists.sql.
export async function getMyCheckedTravelBookItemIds(userId: string, travelBookId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('travel_book_item_checks')
    .select('travel_book_item_id')
    .eq('user_id', userId)
    .eq('travel_book_id', travelBookId);
  if (error) throw error;
  return new Set(data.map((row) => row.travel_book_item_id));
}

export async function checkTravelBookItem(userId: string, travelBookId: string, itemId: string): Promise<void> {
  const { error } = await supabase
    .from('travel_book_item_checks')
    .insert({ user_id: userId, travel_book_id: travelBookId, travel_book_item_id: itemId });
  if (error) throw error;
}

export async function uncheckTravelBookItem(userId: string, itemId: string): Promise<void> {
  const { error } = await supabase
    .from('travel_book_item_checks')
    .delete()
    .eq('user_id', userId)
    .eq('travel_book_item_id', itemId);
  if (error) throw error;
}

// Travel-book settings — see travel-book/[id]/settings.tsx. Mirrors boards.ts's
// updateBoardPrivacy; travel books have no list_style column (ranking is
// scoped to boards only).
export async function updateTravelBookPrivacy(bookId: string, isPrivate: boolean): Promise<void> {
  const { error } = await supabase.from('travel_books').update({ is_private: isPrivate }).eq('id', bookId);
  if (error) throw error;
}
