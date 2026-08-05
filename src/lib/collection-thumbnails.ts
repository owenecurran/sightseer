import { getLatestReviewPhotoIds } from '@/lib/boards';
import { getCoverViewUrls } from '@/lib/covers';
import type { Database } from '@/lib/database.types';
import { getPhotoViewUrls } from '@/lib/photo-view';
import type { TravelBookListItem } from '@/lib/travel-books';

type BoardRow = Database['public']['Tables']['boards']['Row'];

// Precedence: explicit cover_photo_r2_key (a custom-uploaded cover) >
// cover_photo_id (a chosen existing item photo) > most-recently-added item's
// photo. Extracted from (tabs)/boards.tsx so every surface that needs a
// board cover thumbnail (the boards tab, the /collections/[userId] screen,
// the profile teaser) shares one implementation instead of copy-pasting it.
export async function getBoardThumbnailUrls(boards: BoardRow[]): Promise<Record<string, string>> {
  if (boards.length === 0) return {};
  const boardsWithoutCover = boards.filter((b) => !b.cover_photo_id);
  const latestPhotoIdByBoard = await getLatestReviewPhotoIds(boardsWithoutCover.map((b) => b.id));
  const photoIdByBoard: Record<string, string> = { ...latestPhotoIdByBoard };
  for (const b of boards) {
    if (b.cover_photo_id) photoIdByBoard[b.id] = b.cover_photo_id;
  }
  const photoIds = Object.values(photoIdByBoard);
  const [photoUrls, customCoverUrls] = await Promise.all([
    photoIds.length > 0 ? getPhotoViewUrls(photoIds) : Promise.resolve({} as Record<string, string>),
    getCoverViewUrls(
      'boards',
      boards.filter((b) => b.cover_photo_r2_key).map((b) => b.id)
    ),
  ]);
  return {
    ...Object.fromEntries(
      Object.entries(photoIdByBoard)
        .map(([boardId, photoId]) => [boardId, photoUrls[photoId]])
        .filter(([, url]) => url != null)
    ),
    ...customCoverUrls,
  };
}

// Travel books have no "most-recently-added item's photo" fallback (unlike
// boards) — same precedence otherwise: cover_photo_r2_key > cover_photo_id.
export async function getTravelBookThumbnailUrls(books: TravelBookListItem[]): Promise<Record<string, string>> {
  if (books.length === 0) return {};
  const coverPhotoIds = books.map((b) => b.cover_photo_id).filter((id): id is string => id != null);
  const [urls, customCoverUrls] = await Promise.all([
    coverPhotoIds.length > 0 ? getPhotoViewUrls(coverPhotoIds) : Promise.resolve({} as Record<string, string>),
    getCoverViewUrls(
      'travel_books',
      books.filter((b) => b.cover_photo_r2_key).map((b) => b.id)
    ),
  ]);
  return {
    ...Object.fromEntries(
      books
        .filter((b) => b.cover_photo_id && urls[b.cover_photo_id])
        .map((b) => [b.id, urls[b.cover_photo_id!]])
    ),
    ...customCoverUrls,
  };
}
