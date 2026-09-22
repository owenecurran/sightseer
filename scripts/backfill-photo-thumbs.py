"""Give the photos that predate the thumbnail pipeline their derivatives.

Every photo in the database was uploaded before the thumbnail work landed
(the pipeline shipped 2026-08-23; the newest photo is 2026-08-19), so every
one of them has `thumb_r2_key = null` and is served to the feed as a 2048px
original. New uploads make their own thumb on the way in — this is only ever
for the backlog, and once it has run there is nothing left for it to do.

    python scripts/backfill-photo-thumbs.py            # dry run, writes nothing
    python scripts/backfill-photo-thumbs.py --apply    # uploads and updates rows

It matches what the app itself produces, deliberately and to the letter:

  - the key is `<name>_thumb<ext>`, the same expression the edge functions use
    (create-photo-upload-url / create-draft-photo-upload-url);
  - the image is scaled so its LONGEST edge is at most THUMB_MAX_EDGE and
    re-encoded as JPEG at QUALITY, matching makeThumbForUpload in
    src/lib/photo-downscale.ts.

Keep those three constants in step with that file. If they drift, a backfilled
thumb and a freshly uploaded one stop being the same thing.

Signing is done by hand against the stdlib rather than through boto3 or the
AWS SDK, neither of which is installed here — a one-off maintenance script is
not worth adding a dependency to somebody's toolchain for.

Photos whose original is already gone from R2 are reported and skipped. There
are known to be some: five rows point at objects that 404, and no derivative
can be made from an object that is not there.
"""

import argparse
import datetime
import hashlib
import hmac
import io
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

# Must match src/lib/photo-downscale.ts — see the module docstring.
THUMB_MAX_EDGE = 800
QUALITY = 70

REGION = "auto"
SERVICE = "s3"


def load_env(path=".env.local"):
    """Read the R2 credentials. Values are never printed."""
    env = {}
    if not os.path.exists(path):
        sys.exit(f"{path} not found — run this from the project root.")
    with io.open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip('"').strip("'")
    missing = [
        k
        for k in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET_NAME")
        if not env.get(k)
    ]
    if missing:
        sys.exit("missing from .env.local: " + ", ".join(missing))
    return env


def sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def signed_request(env, method, key, body=None, content_type=None):
    """One SigV4-signed S3 request against R2. Returns (status, bytes)."""
    endpoint = env["R2_ENDPOINT"].rstrip("/")
    bucket = env["R2_BUCKET_NAME"]
    parsed = urllib.parse.urlparse(endpoint)
    host = parsed.netloc

    # Path style: the bucket is the first path segment. Each segment is
    # encoded separately so the slashes in a key survive.
    path = "/" + bucket + "/" + "/".join(urllib.parse.quote(p, safe="") for p in key.split("/"))

    payload = body if body is not None else b""
    payload_hash = hashlib.sha256(payload).hexdigest()

    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    headers = {
        "host": host,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    if content_type:
        headers["content-type"] = content_type

    signed_headers = ";".join(sorted(headers))
    canonical_headers = "".join(f"{k}:{headers[k]}\n" for k in sorted(headers))
    canonical_request = "\n".join(
        [method, path, "", canonical_headers, signed_headers, payload_hash]
    )

    scope = f"{date_stamp}/{REGION}/{SERVICE}/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )

    k_date = sign(("AWS4" + env["R2_SECRET_ACCESS_KEY"]).encode("utf-8"), date_stamp)
    k_region = sign(k_date, REGION)
    k_service = sign(k_region, SERVICE)
    k_signing = sign(k_service, "aws4_request")
    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    headers["Authorization"] = (
        f"AWS4-HMAC-SHA256 Credential={env['R2_ACCESS_KEY_ID']}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    request = urllib.request.Request(
        parsed.scheme + "://" + host + path, data=body, method=method, headers=headers
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def db_query(sql):
    """Run one statement through the Supabase CLI and return its rows."""
    result = subprocess.run(
        ["npx", "supabase", "db", "query", "--linked", sql],
        capture_output=True,
        # Explicit, because text=True on its own decodes with the locale's
        # preferred codec — cp1252 on a default Windows console. The Supabase
        # CLI writes UTF-8 and includes non-ASCII progress characters, so the
        # default killed subprocess's reader thread with a UnicodeDecodeError
        # and left stdout as None. That surfaced further down as
        # "'NoneType' object has no attribute 'find'", which says nothing
        # about the real cause. Observed in PowerShell; a UTF-8 shell hides it.
        encoding="utf-8",
        errors="replace",
        text=True,
        shell=(os.name == "nt"),
    )
    if result.stdout is None:
        sys.exit("supabase db query produced no readable output:\n" + (result.stderr or ""))
    if result.returncode != 0:
        sys.exit("supabase db query failed:\n" + (result.stderr or result.stdout))
    start = result.stdout.find("{")
    if start == -1:
        return []
    return json.loads(result.stdout[start:]).get("rows", [])


def thumb_key_for(r2_key):
    """The same expression the edge functions use."""
    return re.sub(r"(\.[^.]+)$", r"_thumb\1", r2_key)


def make_thumb(original):
    image = Image.open(io.BytesIO(original))
    image = image.convert("RGB")
    longest = max(image.size)
    if longest > THUMB_MAX_EDGE:
        scale = THUMB_MAX_EDGE / longest
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)), Image.LANCZOS
        )
    out = io.BytesIO()
    image.save(out, "JPEG", quality=QUALITY, optimize=True)
    return out.getvalue(), image.size


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="actually upload the thumbnails and update the rows",
    )
    args = parser.parse_args()

    env = load_env()
    rows = db_query(
        "select id, r2_key from photos where thumb_r2_key is null order by created_at;"
    )
    if not rows:
        print("nothing to do — every photo already has a thumbnail.")
        return

    mode = "APPLY" if args.apply else "DRY RUN (nothing will be written)"
    print(f"{mode}: {len(rows)} photo(s) without a thumbnail\n")

    converted = missing = failed = 0
    saved_before = saved_after = 0

    for row in rows:
        key = row["r2_key"]
        status, body = signed_request(env, "GET", key)
        if status == 404:
            print(f"  MISSING  {key} — original is not in the bucket, skipped")
            missing += 1
            continue
        if status != 200:
            print(f"  FAILED   {key} — GET returned {status}")
            failed += 1
            continue

        try:
            thumb, size = make_thumb(body)
        except Exception as error:  # noqa: BLE001 - one bad file must not stop the run
            print(f"  FAILED   {key} — could not decode ({error})")
            failed += 1
            continue

        saved_before += len(body)
        saved_after += len(thumb)
        target = thumb_key_for(key)
        detail = f"{len(body)/1024:7.0f}KB -> {len(thumb)/1024:5.0f}KB  {size[0]}x{size[1]}"

        if not args.apply:
            print(f"  would    {target}  {detail}")
            converted += 1
            continue

        put_status, put_body = signed_request(
            env, "PUT", target, body=thumb, content_type="image/jpeg"
        )
        if put_status not in (200, 201):
            print(f"  FAILED   {target} — PUT returned {put_status} {put_body[:120]!r}")
            failed += 1
            continue
        db_query(
            "update photos set thumb_r2_key = '{}' where id = '{}';".format(
                target.replace("'", "''"), str(row["id"]).replace("'", "''")
            )
        )
        print(f"  wrote    {target}  {detail}")
        converted += 1

    print(
        f"\n{converted} converted, {missing} missing original, {failed} failed"
    )
    if saved_before:
        print(
            f"transfer for those photos: {saved_before/1024/1024:.1f}MB -> "
            f"{saved_after/1024/1024:.1f}MB "
            f"({100 - 100*saved_after/saved_before:.0f}% smaller)"
        )
    if not args.apply and converted:
        print("\nre-run with --apply to write them.")


if __name__ == "__main__":
    main()
