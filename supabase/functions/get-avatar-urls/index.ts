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
    const { userIds } = await req.json();

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return Response.json({ error: "userIds must be a non-empty array" }, { status: 400 });
    }

    // users_select_all exposes every user's row to any signed-in caller —
    // an avatar is identity chrome, not follow-gated content, same as a
    // handle being publicly matchable in search.
    const { data: users, error } = await ctx.supabase
      .from("users")
      .select("id, avatar_r2_key")
      .in("id", userIds)
      .not("avatar_r2_key", "is", null);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const results = await Promise.all(
      users.map(async (user) => ({
        userId: user.id,
        url: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: Deno.env.get("R2_BUCKET_NAME"), Key: user.avatar_r2_key! }),
          { expiresIn: VIEW_URL_TTL_SECONDS },
        ),
      })),
    );

    return Response.json({ urls: results });
  }),
};
