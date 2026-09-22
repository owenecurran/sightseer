import { supabase } from '@/lib/supabase';

export type NotificationType =
  | 'board_item_added'
  | 'travel_book_item_added'
  | 'board_saved'
  | 'travel_book_saved'
  | 'like'
  | 'comment'
  | 'follow'
  | 'friend_visit'
  | 'nearby_review_digest'
  | 'tagged'
  | 'friend_review_digest'
  // Somebody whose number is in your contacts has joined. See
  // 20260922120000_contact_joined.sql — the trigger fires when they first
  // make their number matchable, not when the account was created, because
  // that is the only moment the two can be connected.
  | 'contact_joined';

export type AppNotification = {
  id: string;
  type: NotificationType;
  actorUserId: string | null;
  actorName: string;
  // Needed to follow someone back without a second round trip — followUser
  // has to know whether the request lands as accepted or pending.
  actorIsPrivate: boolean;
  boardId: string | null;
  boardName: string | null;
  travelBookId: string | null;
  travelBookTitle: string | null;
  visitId: string | null;
  visitPlaceName: string | null;
  // The review's own first photograph, for the thumbnail beside the line.
  // Null where the review has none — a notification about a review with no
  // picture gets no preview rather than a placeholder box, which would just
  // be a hole in the row.
  visitPhotoId: string | null;
  digestPlaceCount: number | null;
  digestReviewCount: number | null;
  isRead: boolean;
  createdAt: string;
};

type RawNotification = {
  id: string;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
  digest_place_ids: string[] | null;
  digest_review_count: number | null;
  actor: { id: string; name: string | null; handle: string | null; is_private: boolean } | null;
  board: { id: string; name: string } | null;
  travel_book: { id: string; title: string } | null;
  visit: { id: string; places: { name: string } | null; photos: { id: string; position: number }[] } | null;
};

const NOTIFICATION_SELECT =
  'id, type, is_read, created_at, digest_place_ids, digest_review_count, actor:users!actor_id(id, name, handle, is_private), board:boards!board_id(id, name), travel_book:travel_books!travel_book_id(id, title), visit:visits!visit_id(id, places!place_id(name), photos(id, position))';

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;

  return (data as unknown as RawNotification[]).map((row) => ({
    id: row.id,
    type: row.type,
    actorUserId: row.actor?.id ?? null,
    actorName: row.actor?.name ?? row.actor?.handle ?? 'Someone',
    actorIsPrivate: row.actor?.is_private ?? false,
    boardId: row.board?.id ?? null,
    boardName: row.board?.name ?? null,
    travelBookId: row.travel_book?.id ?? null,
    travelBookTitle: row.travel_book?.title ?? null,
    visitId: row.visit?.id ?? null,
    visitPlaceName: row.visit?.places?.name ?? null,
    // Lowest position wins, the same "first photo" every other surface uses.
    visitPhotoId:
      [...(row.visit?.photos ?? [])].sort((a, b) => a.position - b.position)[0]?.id ?? null,
    digestPlaceCount: row.digest_place_ids?.length ?? null,
    digestReviewCount: row.digest_review_count,
    isRead: row.is_read,
    createdAt: row.created_at,
  }));
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', userId)
    .eq('is_read', false);
  if (error) throw error;
}

// One row per THING THAT HAPPENED, rather than one per database row.
//
// Five people liking the same review is five notification rows and one piece
// of news. Left ungrouped it pushed everything else off the screen, and the
// screen's whole job is telling you what you missed — an inbox that buries
// the comment under the likes is failing at exactly that.
//
// Only likes are grouped. The others are not the same shape: two people
// commenting on one review said two different things, and a follow has no
// subject to group by at all.
export type NotificationGroup = {
  key: string;
  // Newest first, matching the list it came from.
  items: AppNotification[];
  // The one that decides the type, the destination and the timestamp.
  latest: AppNotification;
  // Distinct actors, newest first — for the stacked avatars and the names.
  actors: { id: string; name: string }[];
  isRead: boolean;
};

export function groupNotifications(list: AppNotification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();

  for (const item of list) {
    // Anything ungrouped keys on its own id, so it can never collide.
    const key = item.type === 'like' && item.visitId ? `like:${item.visitId}` : item.id;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        items: [item],
        latest: item,
        actors: item.actorUserId ? [{ id: item.actorUserId, name: item.actorName }] : [],
        // A group counts as unread until every notification in it is read,
        // so a new like on a review you already looked at still shows up.
        isRead: item.isRead,
      });
      continue;
    }

    existing.items.push(item);
    existing.isRead = existing.isRead && item.isRead;
    // The same person can only appear once however many rows they have.
    if (item.actorUserId && !existing.actors.some((actor) => actor.id === item.actorUserId)) {
      existing.actors.push({ id: item.actorUserId, name: item.actorName });
    }
  }

  // Insertion order is the order the list arrived in, which is already
  // newest-first — so a group sits where its most recent member sat.
  return [...groups.values()];
}

// "Alice", "Alice and Bob", "Alice, Bob and 3 others".
export function actorSummary(actors: { name: string }[]): string {
  if (actors.length === 0) return 'Someone';
  if (actors.length === 1) return actors[0].name;
  if (actors.length === 2) return `${actors[0].name} and ${actors[1].name}`;
  const rest = actors.length - 2;
  return `${actors[0].name}, ${actors[1].name} and ${rest} other${rest === 1 ? '' : 's'}`;
}
