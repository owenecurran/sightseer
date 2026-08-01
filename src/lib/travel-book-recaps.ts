import { getCachedUrls } from '@/lib/media-url-cache';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type TravelBookRecapRow = Database['public']['Tables']['travel_book_recaps']['Row'];

export async function getRecap(bookId: string): Promise<TravelBookRecapRow | null> {
  const { data, error } = await supabase
    .from('travel_book_recaps')
    .select('*')
    .eq('travel_book_id', bookId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// v1 treats the recap as a single mutable row per book (select-then-insert-
// or-update) — the dedicated table itself is what leaves room for a future
// multi-recap/edit-history model without another migration.
export async function upsertRecapDraft(params: {
  bookId: string;
  authorId: string;
  title: string;
  body?: string;
  rating?: number;
}): Promise<TravelBookRecapRow> {
  const existing = await getRecap(params.bookId);

  if (existing) {
    const { data, error } = await supabase
      .from('travel_book_recaps')
      .update({ title: params.title, body: params.body || null, rating: params.rating ?? null })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('travel_book_recaps')
    .insert({
      travel_book_id: params.bookId,
      author_id: params.authorId,
      title: params.title,
      body: params.body || null,
      rating: params.rating ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function publishRecap(recapId: string): Promise<void> {
  const { error } = await supabase
    .from('travel_book_recaps')
    .update({ is_published: true, published_at: new Date().toISOString() })
    .eq('id', recapId);
  if (error) throw error;
}

export async function unpublishRecap(recapId: string): Promise<void> {
  const { error } = await supabase.from('travel_book_recaps').update({ is_published: false }).eq('id', recapId);
  if (error) throw error;
}

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Same 3-step R2 pattern as avatar/visit-photo upload — the recap row must
// already exist (upsertRecapDraft) since the edge function checks
// author_id ownership by recapId.
export async function uploadRecapCover(params: { recapId: string; uri: string; mimeType?: string }): Promise<string> {
  const { recapId, uri, mimeType } = params;
  const contentType = mimeType && ALLOWED_CONTENT_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';

  const { data, error: fnError } = await supabase.functions.invoke('create-recap-cover-upload-url', {
    body: { recapId, contentType },
  });
  if (fnError) throw fnError;
  const { uploadUrl, r2Key } = data as { uploadUrl: string; r2Key: string };

  const fileResponse = await fetch(uri);
  const blob = await fileResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Upload to storage failed (${uploadResponse.status})`);
  }

  const { error: updateError } = await supabase
    .from('travel_book_recaps')
    .update({ cover_r2_key: r2Key })
    .eq('id', recapId);
  if (updateError) throw updateError;

  return r2Key;
}

export async function getRecapCoverUrls(recapIds: string[]): Promise<Record<string, string>> {
  if (recapIds.length === 0) return {};

  return getCachedUrls(recapIds, async (missingIds) => {
    const { data, error } = await supabase.functions.invoke('get-recap-cover-urls', {
      body: { recapIds: missingIds },
    });
    if (error) throw error;

    const { urls } = data as { urls: { recapId: string; url: string }[] };
    return Object.fromEntries(urls.map((u) => [u.recapId, u.url]));
  });
}

export type FeedRecap = {
  id: string;
  travelBookId: string;
  title: string;
  body: string | null;
  rating: number | null;
  authorId: string;
  authorName: string;
  publishedAt: string;
};

type RawFeedRecap = {
  id: string;
  travel_book_id: string;
  title: string;
  body: string | null;
  rating: number | null;
  author_id: string;
  published_at: string | null;
  users: { handle: string | null; name: string | null } | null;
};

export async function getFeedRecaps(followedIds: string[]): Promise<FeedRecap[]> {
  if (followedIds.length === 0) return [];

  const { data, error } = await supabase
    .from('travel_book_recaps')
    .select('id, travel_book_id, title, body, rating, author_id, published_at, users!author_id(handle, name)')
    .eq('is_published', true)
    .in('author_id', followedIds)
    .order('published_at', { ascending: false });
  if (error) throw error;

  return (data as unknown as RawFeedRecap[]).map((recap) => ({
    id: recap.id,
    travelBookId: recap.travel_book_id,
    title: recap.title,
    body: recap.body,
    rating: recap.rating,
    authorId: recap.author_id,
    authorName: recap.users?.name ?? recap.users?.handle ?? 'Someone',
    publishedAt: recap.published_at ?? '',
  }));
}
