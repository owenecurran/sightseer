import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { matchesMediaKey, validPhotoKeys } from "../_shared/media-keys.ts";

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
// That client comes from withSupabase as ctx.supabaseAdmin rather than being
// built here out of SUPABASE_SERVICE_ROLE_KEY.
//
// NOT a diagnosis of the reported failure. The suspicion was that the key
// this used to build its own client with had gone stale -- this function was
// deployed on 2026-09-01 and every key secret on the project was rewritten on
// 2026-09-09 for the publishable/secret format, while resolve-username-signin
// was updated that same day to take its client from the context. That was
// tested directly against the Auth admin API with the legacy service_role
// key: listing users returned 200 and deleting a non-existent id returned a
// clean 404. The key works. The cause of the non-2xx is still unknown.
//
// It is kept anyway because it is the better shape regardless: one less
// credential wired up by hand, matching the only other function here that
// does admin auth work. The CALLER is still authenticated as themselves, and
// the admin client only ever acts on the id in that verified token, never one
// the request supplies.

// Every stored object belonging to this user, gathered BEFORE anything is
// deleted — once the rows cascade away the keys are unrecoverable and the
// files are orphaned in R2 forever.
//
// Enumerated per table rather than swept by prefix because keys are
// namespaced by entity (visits/<visit_id>/…, drafts/<draft_id>/…), not by
// user, so there is no prefix that means "this person's files".
async function collectR2Keys(admin: SupabaseClient, userId: string): Promise<string[]> {
  const keys: (string | null)[] = [];

  const { data: user } = await admin
    .from("users")
    .select("avatar_r2_key")
    .eq("id", userId)
    .single();
  if (matchesMediaKey(user?.avatar_r2_key, `avatars/${userId}/`)) keys.push(user.avatar_r2_key);

  // Photos hang off visits AND draft_visits — the same table serves both, so
  // one pass over each ownership path covers published and unpublished alike.
  const { data: visitPhotos } = await admin
    .from("photos")
    .select("r2_key, thumb_r2_key, visit_id, draft_visit_id, visits!inner(user_id)")
    .eq("visits.user_id", userId);

  const { data: draftPhotos } = await admin
    .from("photos")
    .select("r2_key, thumb_r2_key, visit_id, draft_visit_id, draft_visits!inner(user_id)")
    .eq("draft_visits.user_id", userId);
  for (const photo of [...(visitPhotos ?? []), ...(draftPhotos ?? [])]) {
    const validated = validPhotoKeys(photo);
    if (validated) keys.push(validated.original, validated.thumbnail);
  }

  const { data: boards } = await admin
    .from("boards")
    .select("id, cover_photo_r2_key")
    .eq("user_id", userId);
  for (const b of boards ?? []) {
    if (matchesMediaKey(b.cover_photo_r2_key, `covers/boards/${b.id}/`)) keys.push(b.cover_photo_r2_key);
  }

  const { data: books } = await admin
    .from("travel_books")
    .select("id, cover_photo_r2_key")
    .eq("user_id", userId);
  for (const b of books ?? []) {
    if (matchesMediaKey(b.cover_photo_r2_key, `covers/travel_books/${b.id}/`)) keys.push(b.cover_photo_r2_key);
  }

  const { data: recaps } = await admin
    .from("travel_book_recaps")
    .select("id, cover_r2_key")
    .eq("author_id", userId);
  for (const r of recaps ?? []) {
    if (matchesMediaKey(r.cover_r2_key, `travel-book-recaps/${r.id}/`)) keys.push(r.cover_r2_key);
  }

  const { data: attachments } = await admin
    .from("profile_prompt_attachments")
    .select("photo_r2_key, profile_prompts!inner(user_id)")
    .eq("profile_prompts.user_id", userId);
  for (const a of attachments ?? []) {
    if (matchesMediaKey(a.photo_r2_key, `prompt-photos/${userId}/`)) keys.push(a.photo_r2_key);
  }

  // Articles deliberately excluded: author_id is now SET NULL, so the
  // article outlives the account and keeps its cover image.
  return [...new Set(keys.filter((k): k is string => typeof k === "string" && k.length > 0))];
}

// Anything that escapes comes back as a readable message.
//
// This matters more than it looks. An uncaught throw is a bare platform 500
// with no body, and functions-js turns a body-less non-2xx into the same
// "Edge Function returned a non-2xx status code" that sent this
// investigation round in circles. Whatever fails next should be able to say
// so. The message is the caller's own failure, on their own account, so
// there is nothing here to leak to anybody else.
function handlerError(err: unknown) {
  console.error("delete-account: unhandled", err);
  const message = err instanceof Error ? err.message : String(err);
  return Response.json({ error: `Could not delete the account: ${message}` }, { status: 500 });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
   try {
    // The id comes from the verified token, never from the request body —
    // otherwise this would delete any account by id.
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const admin = ctx.supabaseAdmin;

    // ------------------------------------------------------------------
    // Prove it is still them
    // ------------------------------------------------------------------
    //
    // A live session is not enough for something with no undo. The session
    // on an unlocked phone is whoever is holding it, and typing a handle
    // off the screen above proves only that they can read. The password is
    // the part a bystander does not have.
    //
    // Enforced HERE rather than in the modal, because a check the client
    // performs is a check the client can skip.
    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";
    const captchaToken =
      typeof body?.captchaToken === "string" && body.captchaToken ? body.captchaToken : undefined;

    const { data: authUser, error: lookupError } = await admin.auth.admin.getUserById(userId);
    if (lookupError || !authUser?.user) {
      return Response.json({ error: "Could not confirm your account." }, { status: 500 });
    }

    // An account created with Google or Apple and never given a password has
    // no 'email' identity and so has nothing to confirm. Requiring one would
    // make deletion impossible for those accounts, which is worse than the
    // weaker check — they still had to get past the handle step, and they
    // hold a live OAuth-backed session.
    const hasPassword = (authUser.user.identities ?? []).some(
      (identity) => identity.provider === "email"
    );

    if (hasPassword) {
      if (!password) {
        return Response.json({ error: "Enter your password to confirm." }, { status: 400 });
      }
      if (!authUser.user.email) {
        return Response.json({ error: "Could not confirm your account." }, { status: 500 });
      }
      // There is no admin API for "verify this password" that skips issuing
      // a grant, so this goes through a real sign-in server-side — the same
      // approach, and the same captcha forwarding, as resolve-username-signin.
      // The session it hands back is discarded; the account is about to stop
      // existing anyway.
      const anon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!
      );
      const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
        email: authUser.user.email,
        password,
        options: captchaToken ? { captchaToken } : undefined,
      });
      if (signInError || !signIn.session) {
        // Distinguished from a wrong password on purpose: a captcha failure
        // is not something the user can fix by retyping, and reporting it as
        // "wrong password" sends them round the same loop forever.
        const isCaptcha = /captcha/i.test(signInError?.message ?? "");
        return Response.json(
          { error: isCaptcha ? "Security check failed. Try again." : "That password is not right." },
          { status: 401 }
        );
      }
    }

    const keys = await collectR2Keys(admin, userId);

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
      console.error("delete-account: deleteUser failed", error);
      return Response.json({ error: `Could not delete the account: ${error.message}` }, { status: 500 });
    }

    return Response.json({ deleted: true, objectsDeleted: keys.length - failed.length, failed });
   } catch (err) {
     return handlerError(err);
   }
  }),
};
