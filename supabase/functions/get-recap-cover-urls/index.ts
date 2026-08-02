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
  // See get-photo-urls for why — newer AWS SDK versions add checksum
  // params to presigned GET URLs by default, which R2 doesn't support.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { recapIds } = await req.json();

    if (!Array.isArray(recapIds) || recapIds.length === 0) {
      return Response.json({ error: "recapIds must be a non-empty array" }, { status: 400 });
    }

    // RLS-scoped, same reasoning as get-photo-urls: travel_book_recaps_select
    // already implements the author-or-published-and-visible rule, so a
    // recap the caller can't see is simply absent here.
    const { data: recaps, error } = await ctx.supabase
      .from("travel_book_recaps")
      .select("id, cover_r2_key")
      .in("id", recapIds)
      .not("cover_r2_key", "is", null);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const results = await Promise.all(
      recaps.map(async (recap) => ({
        recapId: recap.id,
        url: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: Deno.env.get("R2_BUCKET_NAME"), Key: recap.cover_r2_key! }),
          { expiresIn: VIEW_URL_TTL_SECONDS },
        ),
      })),
    );

    return Response.json({ urls: results });
  }),
};
