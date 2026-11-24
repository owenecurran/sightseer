import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createImageUpload, imageUploadLength, isImageUploadType } from "../_shared/image-upload.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: "Sign in to continue" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const { recapId, contentType, contentLength } = body ?? {};
    if (typeof recapId !== "string" || !isImageUploadType(contentType)) {
      return Response.json({ error: "Invalid recapId or contentType" }, { status: 400 });
    }
    const length = imageUploadLength(contentLength);
    if (length instanceof Response) return length;

    const { data: target, error } = await ctx.supabase.from("travel_book_recaps")
      .select("id, author_id").eq("id", recapId).maybeSingle();
    if (error || !target || target.author_id !== userId) {
      return Response.json({ error: "Recap not found" }, { status: 404 });
    }

    return Response.json(await createImageUpload(`travel-book-recaps/${target.id}`, contentType, length));
  }),
};
