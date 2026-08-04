import { supabase } from '@/lib/supabase';

export type AppNotification = {
  id: string;
  type: 'board_item_added' | 'travel_book_item_added';
  actorName: string;
  boardId: string | null;
  boardName: string | null;
  travelBookId: string | null;
  travelBookTitle: string | null;
  isRead: boolean;
  createdAt: string;
};

type RawNotification = {
  id: string;
  type: 'board_item_added' | 'travel_book_item_added';
  is_read: boolean;
  created_at: string;
  actor: { name: string | null; handle: string | null } | null;
  board: { id: string; name: string } | null;
  travel_book: { id: string; title: string } | null;
};

const NOTIFICATION_SELECT =
  'id, type, is_read, created_at, actor:users!actor_id(name, handle), board:boards!board_id(id, name), travel_book:travel_books!travel_book_id(id, title)';

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
    actorName: row.actor?.name ?? row.actor?.handle ?? 'Someone',
    boardId: row.board?.id ?? null,
    boardName: row.board?.name ?? null,
    travelBookId: row.travel_book?.id ?? null,
    travelBookTitle: row.travel_book?.title ?? null,
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
