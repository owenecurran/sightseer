import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const UPLOAD_URL_TTL_SECONDS = 300;
const ALLOWED_TABLES = ["boards", "travel_books", "articles"] as const;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  },
});

// Shared by boards and travel_books — same "standalone cover, unrelated to
// any saved item" upload, just a different owning table. The RLS-scoped
// ctx.supabase query below is the ownership check: it only returns a row if
// the caller is that board/travel_book's owner (boards_select/
// travel_books_select's `auth.uid() = user_id` branch), same idea as the
// explicit visit.user_id check create-photo-upload-url does.
export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { table, id, contentType } = await req.json();

    if (!ALLOWED_TABLES.includes(table)) {
      return Response.json({ error: "Invalid table" }, { status: 400 });
    }
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return Response.json({ error: "Invalid contentType" }, { status: 400 });
    }

    // articles has no user_id (it's author_id, the authoring admin, not
    // per-row ownership) — the check there is "are you an admin at all",
    // not "do you own this specific row", matching articles_update_admin's
    // own RLS shape.
    if (table === "articles") {
      const { data: adminRow, error: adminError } = await ctx.supabase
        .from("users")
        .select("id")
        .eq("id", ctx.userClaims.id)
        .eq("is_admin", true)
        .maybeSingle();
      if (adminError) {
        return Response.json({ error: adminError.message }, { status: 500 });
      }
      if (!adminRow) {
        return Response.json({ error: "Not found or not yours" }, { status: 404 });
      }
    } else {
      const { data: owned, error: ownError } = await ctx.supabase
        .from(table)
        .select("id")
        .eq("id", id)
        .eq("user_id", ctx.userClaims.id)
        .maybeSingle();
      if (ownError) {
        return Response.json({ error: ownError.message }, { status: 500 });
      }
      if (!owned) {
        return Response.json({ error: "Not found or not yours" }, { status: 404 });
      }
    }

    const extension = contentType.split("/")[1];
    const r2Key = `covers/${table}/${id}/${crypto.randomUUID()}.${extension}`;

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: Deno.env.get("R2_BUCKET_NAME"),
        Key: r2Key,
        ContentType: contentType,
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    return Response.json({ uploadUrl, r2Key });
  }),
};
