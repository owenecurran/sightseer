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
    const { visitId, contentType } = await req.json();

    if (typeof visitId !== "string" || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return Response.json({ error: "Invalid visitId or contentType" }, { status: 400 });
    }

    // RLS-scoped: only returns the visit if the caller can see it at all.
    // Still need the explicit owner check below — visibility (public/followed
    // accounts) is broader than ownership, and only the owner may upload here.
    const { data: visit, error } = await ctx.supabase
      .from("visits")
      .select("id, user_id")
      .eq("id", visitId)
      .single();

    if (error || !visit || visit.user_id !== ctx.userClaims.id) {
      return Response.json({ error: "Visit not found" }, { status: 404 });
    }

    const extension = contentType.split("/")[1];
    const r2Key = `visits/${visitId}/${crypto.randomUUID()}.${extension}`;
    // A second object alongside the original. Same folder and uuid with a
    // suffix, so the pair is obvious when browsing the bucket and the thumb
    // is trivially derivable from the full key if it is ever needed.
    const thumbR2Key = r2Key.replace(/(\.[^.]+)$/, "_thumb$1");

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: Deno.env.get("R2_BUCKET_NAME"),
        Key: r2Key,
        ContentType: contentType,
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    const thumbUploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: Deno.env.get("R2_BUCKET_NAME"),
        Key: thumbR2Key,
        ContentType: contentType,
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    return Response.json({ uploadUrl, r2Key, thumbUploadUrl, thumbR2Key });
  }),
};
