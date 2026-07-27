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
});

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { attachmentIds } = await req.json();

    if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
      return Response.json({ error: "attachmentIds must be a non-empty array" }, { status: 400 });
    }

    // profile_prompt_attachments_select already implements the same
    // visibility rule used everywhere else, so an attachment the caller
    // can't see is simply absent here — no separate authorization check needed.
    const { data: attachments, error } = await ctx.supabase
      .from("profile_prompt_attachments")
      .select("id, photo_r2_key")
      .in("id", attachmentIds)
      .not("photo_r2_key", "is", null);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const results = await Promise.all(
      attachments.map(async (attachment) => ({
        attachmentId: attachment.id,
        url: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: Deno.env.get("R2_BUCKET_NAME"), Key: attachment.photo_r2_key! }),
          { expiresIn: VIEW_URL_TTL_SECONDS },
        ),
      })),
    );

    return Response.json({ urls: results });
  }),
};
