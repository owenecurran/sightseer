import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const VIEW_URL_TTL_SECONDS = 3600;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  },
  // Newer AWS SDK v3 versions default to adding flexible-checksum params
  // (x-amz-checksum-mode) to presigned GET URLs via response-checksum
  // validation, which R2 doesn't support — it causes R2 to error the
  // request in a way that also drops CORS headers from the response,
  // which browsers then just report as a CORS block. requestChecksumCalculation
  // covers PUT/write; responseChecksumValidation is the one that actually
  // controls this GET-side param.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { photoIds } = await req.json();

    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return Response.json({ error: "photoIds must be a non-empty array" }, { status: 400 });
    }

    // RLS-scoped: photos_select already implements the same visibility rule
    // (owner, public account, or accepted follow) used everywhere else in
    // the app, so any photo the caller can't see is simply absent here —
    // no separate authorization check needed, unlike the upload function
    // where ownership (not just visibility) had to be checked explicitly.
    const { data: photos, error } = await ctx.supabase
      .from("photos")
      .select("id, r2_key")
      .in("id", photoIds);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const results = await Promise.all(
      photos.map(async (photo) => ({
        photoId: photo.id,
        url: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: Deno.env.get("R2_BUCKET_NAME"), Key: photo.r2_key }),
          { expiresIn: VIEW_URL_TTL_SECONDS },
        ),
      })),
    );

    return Response.json({ urls: results });
  }),
};
