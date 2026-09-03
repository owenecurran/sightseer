import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Longer than get-photo-urls' hour. These are a fixed, curated set shown on
// one screen that a person sits on for seconds, and re-signing them costs a
// round trip on the very first launch of the app — the moment where a slow
// screen is most expensive.
const VIEW_URL_TTL_SECONDS = 21600;

// Nothing is drawn past this, so signing more is wasted work. The road
// shows seven at a time and repeats a smaller pool, so a generous cap here
// still covers every sensible curation.
const MAX_IMAGES = 24;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  },
  // Same R2 incompatibility get-photo-urls documents: newer AWS SDK v3
  // adds checksum params to presigned GETs that R2 rejects in a way
  // browsers report as a CORS block.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export default {
  // The second unauthenticated function in this project, after
  // resolve-username-signin, and for the same kind of reason: the welcome
  // screen is what a fresh install renders BEFORE anyone has an account, so
  // there is no session to authenticate with.
  //
  // Safe to leave open because it signs nothing the caller chooses. It
  // takes no input at all and only ever signs the rows an admin has
  // explicitly curated into landing_images — an anonymous caller cannot
  // point it at an arbitrary R2 key or at somebody's private review photo.
  fetch: withSupabase({ auth: "none" }, async (_req, ctx) => {
    const { data: images, error } = await ctx.supabase
      .from("landing_images")
      .select("id, r2_key")
      .order("position", { ascending: true })
      .limit(MAX_IMAGES);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const urls = await Promise.all(
      (images ?? []).map(async (image) => ({
        id: image.id,
        url: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: Deno.env.get("R2_BUCKET_NAME"), Key: image.r2_key }),
          { expiresIn: VIEW_URL_TTL_SECONDS },
        ),
      })),
    );

    return Response.json({ urls });
  }),
};
