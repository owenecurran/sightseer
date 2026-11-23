import { DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import type { SupabaseClient } from "@supabase/supabase-js";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  },
});

export async function cleanupAccountMedia(admin: SupabaseClient, accountId?: string): Promise<void> {
  const { data, error } = await admin.rpc("claim_account_media_cleanup", {
    p_account_id: accountId,
  });
  if (error) throw error;

  const keys = (data as { object_key: string }[]).map((row) => row.object_key);
  if (!keys.length) return;

  const result = await s3.send(new DeleteObjectsCommand({
    Bucket: Deno.env.get("R2_BUCKET_NAME")!,
    Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
  }), { abortSignal: AbortSignal.timeout(15_000) });

  const failures = result.Errors ?? [];
  if (failures.some((failure) => !failure.Key || !keys.includes(failure.Key))) {
    throw new Error("R2 returned an unrecognized account media deletion error");
  }

  const failedKeys = new Set(failures.map((failure) => failure.Key));
  const deletedKeys = keys.filter((key) => !failedKeys.has(key));
  if (deletedKeys.length) {
    const { error: completionError } = await admin.rpc("complete_account_media_cleanup", {
      p_object_keys: deletedKeys,
    });
    if (completionError) throw completionError;
  }
  if (failedKeys.size) {
    console.warn(`account media cleanup: ${failedKeys.size} objects will be retried`);
  }
}
