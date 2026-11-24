import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createImageUpload, imageUploadLength, isImageUploadType } from "../_shared/image-upload.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: "Sign in to continue" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const { table, id, contentType, contentLength } = body ?? {};

    if (table !== "boards" && table !== "travel_books" && table !== "articles") {
      return Response.json({ error: "Invalid table" }, { status: 400 });
    }
    if (typeof id !== "string" || !isImageUploadType(contentType)) {
      return Response.json({ error: "Invalid cover ID or contentType" }, { status: 400 });
    }
    const length = imageUploadLength(contentLength);
    if (length instanceof Response) return length;

    let target = ctx.supabase.from(table).select("id").eq("id", id);
    if (table === "articles") {
      const { data: isAdmin, error: adminError } = await ctx.supabase.rpc("is_admin_user");
      if (adminError) {
        console.error("create-cover-upload-url: admin lookup", adminError);
        return Response.json({ error: "Could not check article permissions" }, { status: 500 });
      }
      if (!isAdmin) {
        return Response.json({ error: "Not found or not yours" }, { status: 404 });
      }
    } else {
      target = target.eq("user_id", userId);
    }

    const { data: row, error } = await target.maybeSingle();
    if (error || !row) return Response.json({ error: "Not found or not yours" }, { status: 404 });
    return Response.json(await createImageUpload(`covers/${table}/${row.id}`, contentType, length));
  }),
};
