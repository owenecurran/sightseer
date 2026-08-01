import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const UPLOAD_URL_TTL_SECONDS = 300;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  },
});

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { recapId, contentType } = await req.json();

    if (typeof recapId !== "string" || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return Response.json({ error: "Invalid recapId or contentType" }, { status: 400 });
    }

    // A recap's own author is who may attach a cover — same shape as the
    // visit-photo upload check (ownership, not just visibility).
    const { data: recap, error } = await ctx.supabase
      .from("travel_book_recaps")
      .select("id, author_id")
      .eq("id", recapId)
      .single();

    if (error || !recap || recap.author_id !== ctx.userClaims.id) {
      return Response.json({ error: "Recap not found" }, { status: 404 });
    }

    const extension = contentType.split("/")[1];
    const r2Key = `travel-book-recaps/${recapId}/${crypto.randomUUID()}.${extension}`;

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
