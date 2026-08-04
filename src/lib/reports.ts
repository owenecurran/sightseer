import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type ReportReason = Database['public']['Tables']['reports']['Row']['reason'];

export type PendingReport = {
  id: string;
  reason: ReportReason;
  createdAt: string;
  // Null when the reported visit was already deleted (e.g. by its owner)
  // before an admin acted on the report — snapshot fields below still
  // describe what was reported, but there's nothing left to delete.
  visitId: string | null;
  visitRating: number | null;
  visitNote: string | null;
  placeName: string;
  authorName: string;
  reporterName: string;
};

type RawReport = {
  id: string;
  reason: ReportReason;
  created_at: string;
  visit_id: string | null;
  snapshot_place_name: string | null;
  snapshot_author_name: string | null;
  snapshot_rating: number | null;
  snapshot_note: string | null;
  visits: {
    rating: number | null;
    note: string | null;
    places: { name: string } | null;
    users: { handle: string | null; name: string | null } | null;
  } | null;
  reporter: { handle: string | null; name: string | null } | null;
};

export async function reportVisit(
  reporterId: string,
  visitId: string,
  reason: ReportReason
): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: reporterId, visit_id: visitId, reason });
  if (error) throw error;
}

export async function listPendingReports(): Promise<PendingReport[]> {
  const { data, error } = await supabase
    .from('reports')
    .select(
      'id, reason, created_at, visit_id, snapshot_place_name, snapshot_author_name, snapshot_rating, snapshot_note, visits(rating, note, places!place_id(name), users!user_id(handle, name)), reporter:users!reporter_id(handle, name)'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;

  return (data as unknown as RawReport[]).map((r) => ({
    id: r.id,
    reason: r.reason,
    createdAt: r.created_at,
    visitId: r.visit_id,
    visitRating: r.visits?.rating ?? r.snapshot_rating,
    visitNote: r.visits?.note ?? r.snapshot_note,
    placeName: r.visits?.places?.name ?? r.snapshot_place_name ?? 'Unknown place',
    authorName:
      r.visits?.users?.name ?? r.visits?.users?.handle ?? r.snapshot_author_name ?? 'Someone',
    reporterName: r.reporter?.name ?? r.reporter?.handle ?? 'Someone',
  }));
}

export async function dismissReport(reportId: string): Promise<void> {
  const { error } = await supabase.from('reports').update({ status: 'dismissed' }).eq('id', reportId);
  if (error) throw error;
}

// Removes the reported visit entirely, then marks the report resolved.
export async function removeVisitAndResolveReport(reportId: string, visitId: string): Promise<void> {
  const { error: deleteError } = await supabase.from('visits').delete().eq('id', visitId);
  if (deleteError) throw deleteError;
  const { error: updateError } = await supabase
    .from('reports')
    .update({ status: 'resolved' })
    .eq('id', reportId);
  if (updateError) throw updateError;
}
