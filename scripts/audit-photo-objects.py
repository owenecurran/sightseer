"""Check that every photo row's R2 object is actually there, and intact.

READ-ONLY. It issues HEAD and ranged GET requests and writes nothing, to R2
or to the database.

    python scripts/audit-photo-objects.py                  # every photo it can read
    python scripts/audit-photo-objects.py --user <uuid>    # one account's photos

A photo can be wrong in three different ways and they have different causes,
so they are reported separately rather than as one "broken" count:

  MISSING    the key 404s. The row points at an object that is not in the
             bucket — deleted, or never successfully uploaded.
  TRUNCATED  the object exists but does not end in a JPEG end-of-image
             marker. That is a partial upload: the bytes that arrived were
             stored, the rest never came.
  NOT-JPEG   the object exists but does not start with the JPEG magic
             bytes. Something other than the image was written to the key.

Intactness is checked with two 2-byte ranged reads rather than by
downloading the file, because these originals run to several megabytes each
and the markers are the part that answers the question. It will not detect
damage in the middle of an otherwise well-formed file; nothing cheap will.

Signing is done by hand against the stdlib, for the same reason
backfill-photo-thumbs.py does it: neither boto3 nor the AWS SDK is installed
and a maintenance script is not worth a dependency.
"""

import argparse
import datetime
import hashlib
import hmac
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

REGION = "auto"
SERVICE = "s3"

JPEG_SOI = b"\xff\xd8"
JPEG_EOI = b"\xff\xd9"


def load_env(path=".env.local"):
    """Read the R2 credentials and Supabase URL. Values are never printed."""
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
        for k in (
            "R2_ACCESS_KEY_ID",
            "R2_SECRET_ACCESS_KEY",
            "R2_ENDPOINT",
            "R2_BUCKET_NAME",
            "EXPO_PUBLIC_SUPABASE_URL",
            "EXPO_PUBLIC_SUPABASE_ANON_KEY",
        )
        if not env.get(k)
    ]
    if missing:
        sys.exit("missing from .env.local: " + ", ".join(missing))
    return env


def sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def signed_request(env, method, key, extra_headers=None, body=None):
    """One SigV4-signed S3 request against R2. Returns (status, headers, body).

    `body` is for the repair script's PUTs (scripts/repair-heic-photos.py).
    The audit itself only ever reads.
    """
    endpoint = env["R2_ENDPOINT"].rstrip("/")
    bucket = env["R2_BUCKET_NAME"]
    parsed = urllib.parse.urlparse(endpoint)
    host = parsed.netloc

    path = "/" + bucket + "/" + "/".join(urllib.parse.quote(p, safe="") for p in key.split("/"))
    # SigV4 signs the payload, so this has to be the real body or the
    # signature is rejected.
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
    # Every header that travels has to be signed, the Range one included, or
    # R2 rejects the signature.
    for name, value in (extra_headers or {}).items():
        headers[name.lower()] = value

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
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers or {}), error.read()
    except urllib.error.URLError as error:
        return 0, {}, str(error).encode()


def check_object(env, key):
    """(verdict, size) for one key. Verdict is OK / MISSING / TRUNCATED / NOT-JPEG."""
    status, headers, _ = signed_request(env, "HEAD", key)
    if status == 404:
        return "MISSING", None
    if status != 200:
        return f"HTTP-{status}", None

    size = int(headers.get("Content-Length") or 0)
    if size == 0:
        return "TRUNCATED", 0

    status_a, _, head_bytes = signed_request(env, "GET", key, {"range": "bytes=0-1"})
    if status_a in (200, 206) and not head_bytes.startswith(JPEG_SOI):
        return "NOT-JPEG", size

    status_b, _, tail_bytes = signed_request(
        env, "GET", key, {"range": f"bytes={max(size - 2, 0)}-{size - 1}"}
    )
    if status_b in (200, 206) and tail_bytes != JPEG_EOI:
        return "TRUNCATED", size

    return "OK", size


def db_query(sql):
    """Run one statement through the linked Supabase CLI and return its rows.

    Same approach as backfill-photo-thumbs.py, including the explicit
    encoding — text=True alone decodes with the locale's codec, which on a
    Windows console is cp1252, and the CLI emits UTF-8.
    """
    result = subprocess.run(
        ["npx", "supabase", "db", "query", "--linked", sql],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        text=True,
        shell=(os.name == "nt"),
    )
    if result.returncode != 0 or not result.stdout:
        sys.exit("supabase db query failed:\n" + (result.stderr or result.stdout or ""))
    start = result.stdout.find("{")
    if start == -1:
        return []
    return json.loads(result.stdout[start:]).get("rows", [])


def fetch_rows_via_cli(user_id):
    """Every photo row, drafts and private accounts included.

    The anon path below cannot see either: RLS hides private accounts, and a
    photo still attached to an unpublished draft has a null visit_id so it
    never joins to a visit at all. That blind spot is not hypothetical — the
    first run of this audit reported 32 rows and declared them all sound,
    while an eleventh HEIC sat in a draft where it could not be seen.
    """
    columns = "id, visit_id, position, r2_key, thumb_r2_key, width, height, created_at"
    if user_id:
        sql = (
            f"select {columns} from photos where visit_id in "
            f"(select id from visits where user_id = '{user_id}') order by created_at;"
        )
    else:
        sql = f"select {columns} from photos order by created_at;"
    return db_query(sql)


def fetch_rows(env, user_id):
    """Photo rows, via PostgREST. RLS applies — private accounts return nothing."""
    base = env["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["EXPO_PUBLIC_SUPABASE_ANON_KEY"]

    def get(path):
        request = urllib.request.Request(
            base + path, headers={"apikey": key, "Authorization": "Bearer " + key}
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode())

    select = "select=id,visit_id,position,r2_key,thumb_r2_key,width,height,created_at"
    if user_id:
        visits = get(f"/rest/v1/visits?select=id&user_id=eq.{user_id}")
        ids = ",".join(v["id"] for v in visits)
        if not ids:
            return []
        return get(f"/rest/v1/photos?{select}&visit_id=in.({ids})&order=created_at")
    return get(f"/rest/v1/photos?{select}&order=created_at")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", help="only this user's photos")
    parser.add_argument(
        "--anon",
        action="store_true",
        help="read rows through PostgREST with the anon key instead of the linked CLI "
        "(public, published photos only — misses drafts and private accounts)",
    )
    args = parser.parse_args()

    env = load_env()
    # The CLI by default: it is the only source that sees every row.
    rows = fetch_rows(env, args.user) if args.anon else fetch_rows_via_cli(args.user)
    print(f"photo rows: {len(rows)}\n")

    tally = {}
    bad = []
    for row in rows:
        verdict, size = check_object(env, row["r2_key"])
        tally[verdict] = tally.get(verdict, 0) + 1

        thumb_verdict = "-"
        if row["thumb_r2_key"]:
            thumb_verdict, _ = check_object(env, row["thumb_r2_key"])
            tally["thumb:" + thumb_verdict] = tally.get("thumb:" + thumb_verdict, 0) + 1
        else:
            tally["thumb:none"] = tally.get("thumb:none", 0) + 1

        flag = "" if verdict == "OK" and thumb_verdict in ("OK", "-") else "  <-- "
        size_text = f"{size / 1024:.0f}KB" if size else "-"
        print(
            f"  {row['id'][:8]}  {verdict:<9} {size_text:>8}  thumb={thumb_verdict:<9}"
            f" {row['created_at'][:10]}  {row['r2_key']}{flag}"
        )
        if verdict != "OK" or thumb_verdict not in ("OK", "-"):
            bad.append((row, verdict, thumb_verdict))

    print("\ntally:")
    for name in sorted(tally):
        print(f"  {name:<18} {tally[name]}")

    if bad:
        print(f"\n{len(bad)} row(s) need attention:")
        for row, verdict, thumb_verdict in bad:
            print(f"  {row['id']}  visit={row['visit_id']}  original={verdict} thumb={thumb_verdict}")


if __name__ == "__main__":
    main()
