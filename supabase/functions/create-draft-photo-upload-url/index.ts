import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createReviewPhotoUpload, imageUploadLength, isImageUploadType } from "../_shared/image-upload.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: "Sign in to continue" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const { draftId, contentType, contentLength, thumbnailContentLength } = body ?? {};
    if (typeof draftId !== "string" || !isImageUploadType(contentType)) {
      return Response.json({ error: "Invalid draftId or contentType" }, { status: 400 });
    }
    const length = imageUploadLength(contentLength);
    if (length instanceof Response) return length;

    const { data: target, error } = await ctx.supabase.from("draft_visits")
      .select("id, user_id").eq("id", draftId).maybeSingle();
    if (error || !target || target.user_id !== userId) {
      return Response.json({ error: "Draft not found" }, { status: 404 });
    }

    return await createReviewPhotoUpload(`drafts/${target.id}`, contentType, length, thumbnailContentLength);
  }),
};
