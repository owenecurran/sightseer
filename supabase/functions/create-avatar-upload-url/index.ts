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
    const { contentType } = await req.json();

    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return Response.json({ error: "Invalid contentType" }, { status: 400 });
    }

    // No ownership check needed beyond the caller's own id — an avatar
    // always belongs to the uploader, unlike a visit photo.
    const extension = contentType.split("/")[1];
    const r2Key = `avatars/${ctx.userClaims.id}/${crypto.randomUUID()}.${extension}`;

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
