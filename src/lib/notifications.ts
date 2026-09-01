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
  | 'tagged';

export type AppNotification = {
  id: string;
  type: NotificationType;
  actorUserId: string | null;
  actorName: string;
  boardId: string | null;
  boardName: string | null;
  travelBookId: string | null;
  travelBookTitle: string | null;
  visitId: string | null;
  visitPlaceName: string | null;
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
  actor: { id: string; name: string | null; handle: string | null } | null;
  board: { id: string; name: string } | null;
  travel_book: { id: string; title: string } | null;
  visit: { id: string; places: { name: string } | null } | null;
};

const NOTIFICATION_SELECT =
  'id, type, is_read, created_at, digest_place_ids, digest_review_count, actor:users!actor_id(id, name, handle), board:boards!board_id(id, name), travel_book:travel_books!travel_book_id(id, title), visit:visits!visit_id(id, places!place_id(name))';

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
    boardId: row.board?.id ?? null,
    boardName: row.board?.name ?? null,
    travelBookId: row.travel_book?.id ?? null,
    travelBookTitle: row.travel_book?.title ?? null,
    visitId: row.visit?.id ?? null,
    visitPlaceName: row.visit?.places?.name ?? null,
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
