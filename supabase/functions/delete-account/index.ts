import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const BUCKET = Deno.env.get("R2_BUCKET_NAME")!;
// S3 DeleteObjects caps at 1000 keys per call.
const DELETE_BATCH_SIZE = 1000;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  },
});

// Deleting an auth user is an admin operation, so it needs the service role.
// The CALLER is still authenticated as themselves (withSupabase below) — this
// client only ever acts on the id in that verified token, never on one the
// request supplies.
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Every stored object belonging to this user, gathered BEFORE anything is
// deleted — once the rows cascade away the keys are unrecoverable and the
// files are orphaned in R2 forever.
//
// Enumerated per table rather than swept by prefix because keys are
// namespaced by entity (visits/<visit_id>/…, drafts/<draft_id>/…), not by
// user, so there is no prefix that means "this person's files".
async function collectR2Keys(userId: string): Promise<string[]> {
  const keys: (string | null)[] = [];

  const { data: user } = await admin
    .from("users")
    .select("avatar_r2_key")
    .eq("id", userId)
    .single();
  keys.push(user?.avatar_r2_key ?? null);

  // Photos hang off visits AND draft_visits — the same table serves both, so
  // one pass over each ownership path covers published and unpublished alike.
  const { data: visitPhotos } = await admin
    .from("photos")
    .select("r2_key, thumb_r2_key, visits!inner(user_id)")
    .eq("visits.user_id", userId);
  for (const p of visitPhotos ?? []) keys.push(p.r2_key, p.thumb_r2_key);

  const { data: draftPhotos } = await admin
    .from("photos")
    .select("r2_key, thumb_r2_key, draft_visits!inner(user_id)")
    .eq("draft_visits.user_id", userId);
  for (const p of draftPhotos ?? []) keys.push(p.r2_key, p.thumb_r2_key);

  const { data: boards } = await admin
    .from("boards")
    .select("cover_photo_r2_key, cover_r2_key")
    .eq("user_id", userId);
  for (const b of boards ?? []) keys.push(b.cover_photo_r2_key, b.cover_r2_key);

  const { data: books } = await admin
    .from("travel_books")
    .select("cover_photo_r2_key, cover_r2_key")
    .eq("user_id", userId);
  for (const b of books ?? []) keys.push(b.cover_photo_r2_key, b.cover_r2_key);

  const { data: recaps } = await admin
    .from("travel_book_recaps")
    .select("cover_r2_key")
    .eq("author_id", userId);
  for (const r of recaps ?? []) keys.push(r.cover_r2_key);

  const { data: attachments } = await admin
    .from("profile_prompt_attachments")
    .select("photo_r2_key, profile_prompts!inner(user_id)")
    .eq("profile_prompts.user_id", userId);
  for (const a of attachments ?? []) keys.push(a.photo_r2_key);

  // Articles deliberately excluded: author_id is now SET NULL, so the
  // article outlives the account and keeps its cover image.
  return [...new Set(keys.filter((k): k is string => typeof k === "string" && k.length > 0))];
}

export default {
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    // The id comes from the verified token, never from the request body —
    // otherwise this would delete any account by id.
    const userId = ctx.userClaims.id;

    const keys = await collectR2Keys(userId);

    const failed: string[] = [];
    for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
      const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
      try {
        const result = await s3.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          })
        );
        for (const e of result.Errors ?? []) if (e.Key) failed.push(e.Key);
      } catch {
        failed.push(...batch);
      }
    }

    // Deleting the auth user cascades through public.users and everything
    // referencing it. Done last: if it ran first, the rows naming the R2
    // keys would already be gone.
    //
    // Storage failures deliberately do NOT block this. Someone who asked to
    // be deleted should not stay on file because a bucket call timed out —
    // the orphaned keys are returned so they can be swept, which is the
    // recoverable direction.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ deleted: true, objectsDeleted: keys.length - failed.length, failed });
  }),
};
