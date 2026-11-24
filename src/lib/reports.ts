import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type ReportReason = Database['public']['Tables']['reports']['Row']['reason'];

export type PendingReport = {
  id: string;
  reason: ReportReason;
  details: string | null;
  createdAt: string;
  // Null when the reported visit was already deleted (e.g. by its owner)
  // before an admin acted on the report, or when this report was never
  // about a specific visit to begin with (a direct user report) — snapshot
  // fields below still describe what was reported either way.
  visitId: string | null;
  visitRating: number | null;
  visitNote: string | null;
  // Null for a direct user report (no visit involved at all) rather than
  // 'Unknown place' — moderation.tsx tells the two apart on this.
  placeName: string | null;
  authorName: string;
  reporterName: string;
  // The report's verified account target, if it is still available.
  reportedUserId: string | null;
};

type RawReport = {
  id: string;
  reason: ReportReason;
  details: string | null;
  created_at: string;
  visit_id: string | null;
  reported_user_id: string | null;
  snapshot_place_name: string | null;
  snapshot_author_name: string | null;
  snapshot_rating: number | null;
  snapshot_note: string | null;
  visits: {
    rating: number | null;
    note: string | null;
    places: { name: string } | null;
  } | null;
  target: { handle: string | null; name: string | null } | null;
  reporter: { handle: string | null; name: string | null } | null;
};

export type SubmitReportParams = {
  reporterId: string;
  reason: ReportReason;
  details?: string;
  target: { visitId: string; reportedUserId?: never } | { reportedUserId: string; visitId?: never };
};

export async function submitReport(params: SubmitReportParams): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    reason: params.reason,
    details: params.details?.trim() || null,
    visit_id: params.target.visitId ?? null,
    reported_user_id: params.target.reportedUserId ?? null,
  });
  if (error) throw error;
}

export async function listPendingReports(): Promise<PendingReport[]> {
  const { data, error } = await supabase
    .from('reports')
    .select(
      'id, reason, details, created_at, visit_id, reported_user_id, snapshot_place_name, snapshot_author_name, snapshot_rating, snapshot_note, visits(rating, note, places!place_id(name)), target:users!reported_user_id(handle, name), reporter:users!reporter_id(handle, name)'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;

  return (data as unknown as RawReport[]).map((r) => ({
    id: r.id,
    reason: r.reason,
    details: r.details,
    createdAt: r.created_at,
    visitId: r.visit_id,
    visitRating: r.visits?.rating ?? r.snapshot_rating,
    visitNote: r.visits?.note ?? r.snapshot_note,
    placeName: r.visits?.places?.name ?? r.snapshot_place_name,
    authorName: r.target?.name ?? r.target?.handle ?? r.snapshot_author_name ?? 'Someone',
    reporterName: r.reporter?.name ?? r.reporter?.handle ?? 'Someone',
    reportedUserId: r.reported_user_id,
  }));
}

async function resolveReport(reportId: string, action: 'dismiss' | 'ban_user' | 'remove_visit') {
  const { error } = await supabase.rpc('resolve_report', {
    p_report_id: reportId,
    p_action: action,
  });
  if (error) throw error;
}

export function dismissReport(reportId: string): Promise<void> {
  return resolveReport(reportId, 'dismiss');
}

export function banUserAndResolveReport(reportId: string): Promise<void> {
  return resolveReport(reportId, 'ban_user');
}

export function removeVisitAndResolveReport(reportId: string): Promise<void> {
  return resolveReport(reportId, 'remove_visit');
}
