import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const UPLOAD_URL_TTL_SECONDS = 300;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
});

export function isImageUploadType(value: unknown): value is string {
  return typeof value === "string" && IMAGE_TYPES.includes(value);
}

export function imageUploadLength(value: unknown, thumbnail = false): number | undefined | Response {
  // Enable the requirement after clients have switched to sending Blob.size.
  if (value === undefined && Deno.env.get("R2_REQUIRE_UPLOAD_SIZE") !== "true") return undefined;

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return Response.json({ error: "A positive image byte length is required" }, { status: 400 });
  }
  if (value > (thumbnail ? MAX_THUMBNAIL_BYTES : MAX_IMAGE_BYTES)) {
    return Response.json({ error: thumbnail ? "Thumbnail exceeds 2 MiB" : "Image exceeds 20 MiB" }, { status: 413 });
  }
  return value;
}

async function signImageUpload(r2Key: string, contentType: string, contentLength?: number): Promise<string> {
  return await getSignedUrl(s3, new PutObjectCommand({
    Bucket: Deno.env.get("R2_BUCKET_NAME"),
    Key: r2Key,
    ContentType: contentType,
    ContentLength: contentLength,
  }), {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
    signableHeaders: contentLength === undefined ? undefined : new Set(["content-length", "content-type"]),
  });
}

export async function createImageUpload(folder: string, contentType: string, contentLength?: number) {
  const r2Key = `${folder}/${crypto.randomUUID()}.${contentType.split("/")[1]}`;
  return { r2Key, uploadUrl: await signImageUpload(r2Key, contentType, contentLength) };
}

export async function createReviewPhotoUpload(
  folder: string,
  contentType: string,
  contentLength: number | undefined,
  requestedThumbnailLength: unknown,
): Promise<Response> {
  const wantsThumbnail = requestedThumbnailLength !== null &&
    (requestedThumbnailLength !== undefined || contentLength === undefined);
  const thumbnailLength = wantsThumbnail ? imageUploadLength(requestedThumbnailLength, true) : undefined;
  if (thumbnailLength instanceof Response) return thumbnailLength;

  const original = await createImageUpload(folder, contentType, contentLength);
  if (!wantsThumbnail) return Response.json(original);

  // Keep the existing key pairing for photos and their JPEG thumbnails.
  const thumbR2Key = original.r2Key.replace(/(\.[^.]+)$/, "_thumb$1");
  const thumbUploadUrl = await signImageUpload(thumbR2Key, "image/jpeg", thumbnailLength);
  return Response.json({ ...original, thumbR2Key, thumbUploadUrl });
}
