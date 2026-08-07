import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const VIEW_URL_TTL_SECONDS = 3600;
const ALLOWED_TABLES = ["boards", "travel_books", "articles"] as const;

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
    const { table, ids } = await req.json();

    if (!ALLOWED_TABLES.includes(table)) {
      return Response.json({ error: "Invalid table" }, { status: 400 });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: "ids must be a non-empty array" }, { status: 400 });
    }

    // ctx.supabase is RLS-scoped to the caller — boards_select/
    // travel_books_select already encode "owner, or non-private and
    // visible" here, so an id the caller can't see is just silently absent
    // from the response, same as get-photo-urls.
    const { data: rows, error } = await ctx.supabase
      .from(table)
      .select("id, cover_photo_r2_key")
      .in("id", ids)
      .not("cover_photo_r2_key", "is", null);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const results = await Promise.all(
      rows.map(async (row: { id: string; cover_photo_r2_key: string }) => ({
        id: row.id,
        url: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: Deno.env.get("R2_BUCKET_NAME"), Key: row.cover_photo_r2_key }),
          { expiresIn: VIEW_URL_TTL_SECONDS },
        ),
      })),
    );

    return Response.json({ urls: results });
  }),
};
