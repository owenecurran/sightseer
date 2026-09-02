import { setUserBanned } from '@/lib/bans';
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
  // Who a ban would land on: the reported user for a direct report, or the
  // author of the reported visit. Null only when the visit has already been
  // deleted and the report named no user — nothing left to act against, so
  // moderation.tsx hides the ban action rather than offering a dead button.
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
    user_id: string;
    rating: number | null;
    note: string | null;
    places: { name: string } | null;
    users: { handle: string | null; name: string | null } | null;
  } | null;
  reporter: { handle: string | null; name: string | null } | null;
};

export type SubmitReportParams = {
  reporterId: string;
  reason: ReportReason;
  // Free-text context alongside the fixed reason category — blank/whitespace
  // normalized to null rather than stored as ''.
  details?: string;
  // At least one of these two must be set (reports_has_target, see the
  // migration) — a visit report, a direct user report, or both (e.g.
  // reporting the person while a specific post is what prompted it).
  visitId?: string;
  reportedUserId?: string;
};

export async function submitReport(params: SubmitReportParams): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    reason: params.reason,
    details: params.details?.trim() || null,
    visit_id: params.visitId ?? null,
    reported_user_id: params.reportedUserId ?? null,
  });
  if (error) throw error;
}

export async function listPendingReports(): Promise<PendingReport[]> {
  const { data, error } = await supabase
    .from('reports')
    .select(
      'id, reason, details, created_at, visit_id, reported_user_id, snapshot_place_name, snapshot_author_name, snapshot_rating, snapshot_note, visits(user_id, rating, note, places!place_id(name), users!user_id(handle, name)), reporter:users!reporter_id(handle, name)'
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
    authorName:
      r.visits?.users?.name ?? r.visits?.users?.handle ?? r.snapshot_author_name ?? 'Someone',
    reporterName: r.reporter?.name ?? r.reporter?.handle ?? 'Someone',
    // reported_user_id first: a report filed against the person is a
    // stronger statement of intent than one inferred from a post's author.
    reportedUserId: r.reported_user_id ?? r.visits?.user_id ?? null,
  }));
}

export async function dismissReport(reportId: string): Promise<void> {
  const { error } = await supabase.from('reports').update({ status: 'dismissed' }).eq('id', reportId);
  if (error) throw error;
}

// Bans the reported account, then marks the report resolved.
//
// Mirrors removeVisitAndResolveReport, including the ordering: the action
// that matters happens first, so a failure to close the report leaves an
// enforced ban and a report still visible in the queue, rather than a
// closed report and an unbanned user.
//
// It deliberately leaves the reported content in place. Removing a post and
// banning its author are separate judgements, and an admin who wants both
// has both buttons.
export async function banUserAndResolveReport(
  reportId: string,
  userId: string,
  reason: string
): Promise<void> {
  await setUserBanned(userId, reason);
  const { error } = await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
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
