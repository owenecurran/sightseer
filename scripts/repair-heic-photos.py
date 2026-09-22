"""Re-encode the photos that are HEIC files sitting under .jpeg keys.

    python scripts/repair-heic-photos.py            # dry run, writes nothing
    python scripts/repair-heic-photos.py --apply    # backs up, converts, uploads

WHAT IS WRONG WITH THEM

Nothing, as files. They are complete, undamaged HEIC images. The problem is
that they are stored under keys ending `.jpeg`, served with
`Content-Type: image/jpeg`, and HEIC is a format no browser outside Safari
will decode — so they render as broken everywhere except iOS. They were
uploaded before the downscale pipeline existed, when nothing on the way in
re-encoded anything. scripts/audit-photo-objects.py is what identifies them.

WHAT THIS DOES

For each affected row: downloads the original, decodes the HEIC, re-encodes
it as JPEG at the SAME pixel dimensions, and PUTs it back at the same key.

  - Same key, so no database row changes. `r2_key` already ends `.jpeg` and
    now finally describes what is there. Nothing has to be migrated, and
    nothing can end up pointing at a key that does not exist.

  - Same dimensions, so `width`/`height` in the database stay true and the
    card's aspect ratio does not move. Downscaling to the pipeline's 2048
    would have been defensible, but it would leave every row's recorded size
    describing a file that no longer has it.

  - QUALITY is 92, higher than the 80 the upload path uses. These are
    originals and this is a one-way conversion; the extra bytes are worth
    not visibly degrading a photo nobody can re-upload.

BEFORE OVERWRITING, the original bytes are copied to `<key>.heic.bak`. This
is the only copy of them that will exist once the PUT lands, and it costs a
few megabytes. Delete them once the photos have been seen to be fine.

Thumbnails are NOT made here. Every one of these rows has `thumb_r2_key`
null, because the thumbnail backfill could not decode them either — run
scripts/backfill-photo-thumbs.py --apply afterwards and it will pick them up
now that they are real JPEGs.
"""

import argparse
import io
import sys

import importlib.util

import pillow_heif
from PIL import Image

pillow_heif.register_heif_opener()

QUALITY = 92

# Reuse the audit's R2 signing and row fetching rather than owning a second
# copy of either — they have to agree about what is broken.
_spec = importlib.util.spec_from_file_location("audit", "scripts/audit-photo-objects.py")
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="actually write")
    parser.add_argument("--user", help="restrict to one user's photos")
    args = parser.parse_args()

    env = audit.load_env()
    # Through the linked CLI, not the anon key. The anon path cannot see a
    # photo still attached to an unpublished draft (null visit_id, so it
    # never joins to a visit) nor anything on a private account — and the
    # first repair run missed a HEIC sitting in exactly such a draft.
    rows = audit.fetch_rows_via_cli(args.user)
    print(f"scanning {len(rows)} photo rows\n")

    targets = []
    for row in rows:
        verdict, _ = audit.check_object(env, row["r2_key"])
        if verdict == "NOT-JPEG":
            targets.append(row)

    if not targets:
        print("nothing to repair.")
        return

    print(f"{len(targets)} to repair:\n")
    repaired = 0
    for row in targets:
        key = row["r2_key"]
        status, _, original = audit.signed_request(env, "GET", key)
        if status != 200:
            print(f"  {row['id'][:8]}  SKIP  could not download ({status})")
            continue

        try:
            image = Image.open(io.BytesIO(original))
            image.load()
        except Exception as error:  # noqa: BLE001 - report and continue
            print(f"  {row['id'][:8]}  SKIP  cannot decode: {error}")
            continue

        # HEIC can carry an alpha channel or an exotic mode; JPEG cannot.
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")

        buffer = io.BytesIO()
        # EXIF is deliberately not carried across. The upload path strips it
        # by re-encoding too (see photo-downscale.ts), so keeping it here
        # would make these nine the only photos in the bucket still carrying
        # the GPS coordinates of where they were taken.
        image.save(buffer, format="JPEG", quality=QUALITY, optimize=True)
        converted = buffer.getvalue()

        before = len(original) / 1024
        after = len(converted) / 1024
        print(
            f"  {row['id'][:8]}  {image.width}x{image.height}  "
            f"{before:.0f}KB HEIC -> {after:.0f}KB JPEG",
            end="",
        )

        if not args.apply:
            print("   (dry run)")
            continue

        backup_key = key + ".heic.bak"
        status, _, _ = audit.signed_request(
            env, "PUT", backup_key, {"content-type": "image/heic"}, body=original
        )
        if status not in (200, 201):
            print(f"   BACKUP FAILED ({status}) — not overwriting")
            continue

        status, _, _ = audit.signed_request(
            env, "PUT", key, {"content-type": "image/jpeg"}, body=converted
        )
        if status not in (200, 201):
            print(f"   UPLOAD FAILED ({status}) — original still at {backup_key}")
            continue

        print("   written")
        repaired += 1

    print()
    if args.apply:
        print(f"repaired {repaired} of {len(targets)}.")
        print("next: python scripts/backfill-photo-thumbs.py --apply")
    else:
        print("dry run — nothing written. Re-run with --apply.")


if __name__ == "__main__":
    main()
