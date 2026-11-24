import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createImageUpload, imageUploadLength, isImageUploadType } from "../_shared/image-upload.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: "Sign in to continue" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const { contentType, contentLength } = body ?? {};
    if (!isImageUploadType(contentType)) {
      return Response.json({ error: "Invalid contentType" }, { status: 400 });
    }
    const length = imageUploadLength(contentLength);
    if (length instanceof Response) return length;

    return Response.json(await createImageUpload(`avatars/${userId}`, contentType, length));
  }),
};
