import { supabase } from '@/lib/supabase';

export type Comment = {
  id: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

type RawComment = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  users: { handle: string | null; name: string | null } | null;
};

export async function listComments(visitId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, user_id, body, created_at, users!user_id(handle, name)')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return (data as unknown as RawComment[]).map((c) => ({
    id: c.id,
    userId: c.user_id,
    authorName: c.users?.name ?? c.users?.handle ?? 'Someone',
    body: c.body,
    createdAt: c.created_at,
  }));
}

export async function addComment(visitId: string, userId: string, body: string): Promise<Comment> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ visit_id: visitId, user_id: userId, body: body.trim() })
    .select('id, user_id, body, created_at, users!user_id(handle, name)')
    .single();
  if (error) throw error;

  const raw = data as unknown as RawComment;
  return {
    id: raw.id,
    userId: raw.user_id,
    authorName: raw.users?.name ?? raw.users?.handle ?? 'Someone',
    body: raw.body,
    createdAt: raw.created_at,
  };
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  if (error) throw error;
}
