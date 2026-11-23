import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createClient } from "@supabase/supabase-js";
import { cleanupAccountMedia } from "../_shared/account-media-cleanup.ts";

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };

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
    if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

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

      // The auth cascade queues the account's media in the same transaction.
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        console.error("delete-account: deleteUser failed", error);
        return Response.json({ error: `Could not delete the account: ${error.message}` }, { status: 500 });
      }

      EdgeRuntime.waitUntil(cleanupAccountMedia(admin, userId).catch((err) => {
        console.error("delete-account: media cleanup failed", err);
      }));

      return Response.json({ deleted: true });
    } catch (err) {
      return handlerError(err);
    }
  }),
};
