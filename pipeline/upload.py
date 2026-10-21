"""Put a local clip into Supabase the way the web app's upload route does: the `recordings` bucket plus an
`uploaded` visit.

    python3 pipeline/upload.py clip.mp4 --store B2 --salesperson Akshay --at "2026-10-20 10:44:33"
    python3 pipeline/evaluate.py --pending          # then: transcribe, score, message, all from Supabase

Same rules as the web app (app/api/ux/upload/route.ts on main, lib/data/supabase on ux/supabase-plugin):
- bucket path  lib/storage/path.ts clipPath: <store>/<date>/<store>_<slug(salesperson)>_<date>_<hhmmss-rand4>.<ext>
               (hhmmss = UTC upload time; the visit id doesn't exist yet when the clip is stored)
- visit id     lib/data/visit-list.ts nextVisitId: <store>-<max(1000, every id number in any store) + 1>,
               unless --visit-no is given
- visits row   recorded_at in shop time (+05:30), status `uploaded`, analysis null
--at is shop time (Asia/Kolkata), with or without seconds.
"""
import argparse
import datetime
import json
import random
import re
import string
import sys
import unicodedata
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import store  # noqa: E402
import transcribe  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    add_arguments(ap)
    args = ap.parse_args()
    try:
        row = upload_clip(Path(args.clip), args.store, args.salesperson, args.visit_no, args.at, args.replace)
    except (ValueError, store.StoreError) as e:
        sys.exit(str(e))
    print(f"{row['id']}: uploaded to recordings/{row['media_path']}; recorded_at {row['recorded_at']}; "
          "status `uploaded`")


def add_arguments(ap, required=True):
    ap.add_argument("clip", nargs=None if required else "?")
    ap.add_argument("--store", required=required, help="B1 / B2 / B3")
    ap.add_argument("--salesperson", required=required)
    ap.add_argument("--visit-no", help="e.g. 1103; default: the web app's next id")
    ap.add_argument("--at", required=required, help='start of the visit, shop time: "YYYY-MM-DD HH:MM[:SS]"')
    ap.add_argument("--replace", action="store_true", help="overwrite a visit id that already exists")


def slug(text):
    """path.ts slug(): letters, digits, _ and -, spaces to dashes."""
    text = re.sub(r"[^\w\s-]", "", unicodedata.normalize("NFKD", text)).strip()
    return re.sub(r"\s+", "-", text) or "unknown"


def upload_stamp(now=None):
    """path.ts uploadStamp(): UTC hhmmss of the upload plus 4 random base-36 characters, e.g. 174512-k3f9."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return f"{now:%H%M%S}-{''.join(random.choices(string.ascii_lowercase + string.digits, k=4))}"


def next_visit_id(store_id, ids):
    """visit-list.ts nextVisitId(): one above the highest number used in any store."""
    numbers = [int(i.split("-")[1]) for i in ids if len(i.split("-")) == 2 and i.split("-")[1].isdigit()]
    return f"{store_id}-{max([1000, *numbers]) + 1}"


def parse_at(at):
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.datetime.strptime(at, fmt).replace(tzinfo=ZoneInfo("Asia/Kolkata"))
        except ValueError:
            pass
    raise ValueError(f'--at must look like "2026-10-20 10:44" or "2026-10-20 10:44:33", got {at!r}')


def upload_clip(clip, store_id, salesperson, visit_no, at, replace=False):
    """Clip → `recordings` bucket + `uploaded` visit row. Returns the row (what evaluate.process_visit takes)."""
    if not store.configured():
        raise ValueError("Supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    if not clip.is_file():
        raise ValueError(f"{clip}: no such file")
    mime = transcribe.mime_of(clip)
    if not mime.startswith(("video/", "audio/")):
        raise ValueError(f"{clip.name}: not a video or audio file ({mime})")
    started = parse_at(at)
    salesperson = salesperson.strip()
    if visit_no:
        visit_id = f"{store_id}-{visit_no}"
        # Re-adding a visit resets its analysis, so never do it to an existing visit by accident.
        if not replace and store.visit_exists(visit_id):
            raise ValueError(f"visit {visit_id} already exists; pick another --visit-no, or pass --replace")
    else:
        visit_id = next_visit_id(store_id, [r["id"] for r in json.loads(store._request("GET", "/rest/v1/visits?select=id"))])
    date = started.date().isoformat()
    ext = clip.suffix.lower().lstrip(".") or ("m4a" if mime.startswith("audio/") else "mp4")
    media_path = f"{store_id}/{date}/{store_id}_{slug(salesperson)}_{date}_{upload_stamp()}.{ext}"

    store.upload(media_path, clip.read_bytes(), mime)
    store.add_visit(visit_id, store_id, salesperson, started.isoformat(), media_path)
    return {"id": visit_id, "store": store_id, "salesperson": salesperson, "recorded_at": started.isoformat(),
            "media_path": media_path}


if __name__ == "__main__":
    main()
