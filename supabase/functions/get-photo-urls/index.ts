import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { validPhotoKeys } from "../_shared/media-keys.ts";

const VIEW_URL_TTL_SECONDS = 3600;
const PHOTO_QUERY_BATCH_SIZE = 100;
const MAX_PHOTOS_PER_REQUEST = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const body = await req.json().catch(() => null);
    const photoIds: unknown = body?.photoIds;

    if (!Array.isArray(photoIds) || photoIds.length === 0 || photoIds.length > MAX_PHOTOS_PER_REQUEST ||
      photoIds.some((id) => typeof id !== "string" || !UUID.test(id))) {
      return Response.json({ error: `photoIds must contain 1 to ${MAX_PHOTOS_PER_REQUEST} UUIDs` }, { status: 400 });
    }

    // RLS-scoped: photos_select already implements the same visibility rule
    // (owner, public account, or accepted follow) used everywhere else in
    // the app, so any photo the caller can't see is simply absent here —
    // no separate authorization check needed, unlike the upload function
    // where ownership (not just visibility) had to be checked explicitly.
    const ids = [...new Set<string>(photoIds)];
    const results: { photoId: string; url: string; thumbUrl: string | null }[] = [];
    for (let index = 0; index < ids.length; index += PHOTO_QUERY_BATCH_SIZE) {
      const { data: photos, error } = await ctx.supabase
        .from("photos")
        .select("id, r2_key, thumb_r2_key, visit_id, draft_visit_id")
        .in("id", ids.slice(index, index + PHOTO_QUERY_BATCH_SIZE));

      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }

      const signedPhotos = await Promise.all(photos.flatMap((photo) => {
        const keys = validPhotoKeys(photo);
        if (!keys) return [];
        return [Promise.all([
          sign(keys.original),
          keys.thumbnail ? sign(keys.thumbnail) : null,
        ]).then(([url, thumbUrl]) => ({ photoId: photo.id, url, thumbUrl }))];
      }));
      results.push(...signedPhotos);
    }

    return Response.json({ urls: results });
  }),
};

function sign(key: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: Deno.env.get("R2_BUCKET_NAME"), Key: key }),
    { expiresIn: VIEW_URL_TTL_SECONDS },
  );
}
