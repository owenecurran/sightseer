const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IMAGE_EXTENSION = "\\.(jpeg|png|webp)(?![\\s\\S])";
const FILENAME = new RegExp(`^${UUID}${IMAGE_EXTENSION}`);
const PUBLISHED_DRAFT_KEY = new RegExp(`^drafts/${UUID}/${UUID}${IMAGE_EXTENSION}`);

export function matchesMediaKey(key: string | null | undefined, namespace: string): key is string {
  return typeof key === "string" && key.startsWith(namespace) && FILENAME.test(key.slice(namespace.length));
}

type PhotoKeys = {
  r2_key: string;
  thumb_r2_key: string | null;
  visit_id: string | null;
  draft_visit_id: string | null;
};

export function validPhotoKeys(photo: PhotoKeys): { original: string; thumbnail: string | null } | null {
  const { r2_key: key, thumb_r2_key: thumb, visit_id: visitId, draft_visit_id: draftId } = photo;
  const matchesParent = draftId !== null
    ? matchesMediaKey(key, `drafts/${draftId}/`)
    // Draft publishing retains its original key after removing the draft row.
    : visitId !== null && (matchesMediaKey(key, `visits/${visitId}/`) || PUBLISHED_DRAFT_KEY.test(key));
  if (!matchesParent) return null;

  return { original: key, thumbnail: thumb === key.replace(/(\.[^.]+)$/, "_thumb$1") ? thumb : null };
}
