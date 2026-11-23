import { createClient } from "@supabase/supabase-js";
import { cleanupAccountMedia } from "../_shared/account-media-cleanup.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export default {
  async fetch(req: Request) {
    if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

    const secret = req.headers.get("x-push-secret");
    if (!secret || secret !== Deno.env.get("PUSH_TRIGGER_SECRET")) {
      return new Response(null, { status: 401 });
    }

    try {
      await cleanupAccountMedia(admin);
      return new Response(null, { status: 204 });
    } catch (err) {
      console.error("cleanup-account-media: batch failed", err);
      return new Response(null, { status: 500 });
    }
  },
};
