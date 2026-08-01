import { mapRawFeedVisit, type RawFeedVisit } from '@/lib/feed';
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

export type TravelBookItem = TaggedVisit & { itemId: string; addedBy: string; addedAt: string };

export async function getTravelBookItems(bookId: string, viewerId: string): Promise<TravelBookItem[]> {
  const { data, error } = await supabase
    .from('travel_book_items')
    .select(
      'id, added_by, added_at, visits(id, rating, note, visited_on, created_at, user_id, place_id, users!user_id(handle, name), places!place_id(name), photos(id, position), likes(user_id), visit_tagged_users(users(handle, name)), visit_tagged_places(places(name, category)), comments(id))'
    )
    .eq('travel_book_id', bookId);
  if (error) throw error;

  type Row = { id: string; added_by: string; added_at: string; visits: RawFeedVisit | null };
  const rows = data as unknown as Row[];
  return rows
    .filter((row): row is Row & { visits: RawFeedVisit } => row.visits != null)
    .map((row) => ({
      ...mapRawFeedVisit(row.visits, viewerId),
      itemId: row.id,
      addedBy: row.added_by,
      addedAt: row.added_at,
    }))
    .sort((a, b) => a.visited_on.localeCompare(b.visited_on));
}

export async function getVisitIdsInTravelBook(bookId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('travel_book_items').select('visit_id').eq('travel_book_id', bookId);
  if (error) throw error;
  return new Set(data.map((row) => row.visit_id));
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
      'id, rating, note, visited_on, created_at, user_id, place_id, users!user_id(handle, name), places!place_id(name), photos(id, position), likes(user_id), visit_tagged_users(users(handle, name)), visit_tagged_places(places(name, category)), comments(id)'
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
