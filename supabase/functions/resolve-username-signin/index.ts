import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createClient } from "@supabase/supabase-js";

// Deliberately one fixed message for every failure mode (unknown handle,
// wrong password, or anything else) — never lets a caller distinguish
// "that username doesn't exist" from "wrong password", matching the same
// enumeration-safe generic-response pattern forgot-password.tsx already
// uses elsewhere in this app.
const GENERIC_ERROR = "Incorrect username or password.";

function fail() {
  return Response.json({ error: GENERIC_ERROR }, { status: 400 });
}

// The only unauthenticated (auth: "none") function in this project — every
// other Edge Function here expects the caller to already have a session,
// which by definition can't be true yet at sign-in time. Resolves a handle
// to its account server-side via the service-role client (ctx.supabaseAdmin)
// and never returns the resolved email to the caller — only a session, once
// the password has actually been verified.
export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    const { handle, password } = await req.json();
    if (typeof handle !== "string" || typeof password !== "string" || !handle || !password) {
      return fail();
    }

    const { data: userRow } = await ctx.supabaseAdmin
      .from("users")
      .select("id")
      .eq("handle", handle.trim().toLowerCase())
      .single();
    if (!userRow) {
      return fail();
    }

    const { data: authUser } = await ctx.supabaseAdmin.auth.admin.getUserById(userRow.id);
    if (!authUser?.user?.email) {
      return fail();
    }

    // The actual password-hash check — there's no admin-API shortcut for
    // "verify this password" that skips a real sign-in grant, so this goes
    // through the same call the client would normally make itself, just
    // server-side against the resolved email instead of a typed-in one.
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
      email: authUser.user.email,
      password,
    });
    if (signInError || !signInData.session) {
      return fail();
    }

    return Response.json({
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    });
  }),
};
