"""Put a local clip into Supabase the way the upload page will: the `recordings` bucket plus an `uploaded` visit.

    python3 pipeline/upload.py clip.mp4 --store B2 --salesperson Akshay --visit-no 1014 --at "2026-10-15 18:27"
    python3 pipeline/evaluate.py --pending          # then: transcribe, score, message, all from Supabase

Stands in for the UX upload flow until it writes to the real bucket. --at is shop time (Asia/Kolkata).
"""
import argparse
import datetime
import sys
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
    print(f"{row['id']}: uploaded to recordings/{row['media_path']}; status `uploaded`")


def add_arguments(ap, required=True):
    ap.add_argument("clip", nargs=None if required else "?")
    ap.add_argument("--store", required=required, help="B1 / B2 / B3")
    ap.add_argument("--salesperson", required=required)
    ap.add_argument("--visit-no", required=required, help="e.g. 1014; the visit id becomes <store>-<visit-no>")
    ap.add_argument("--at", required=required, help='start of the visit, shop time: "YYYY-MM-DD HH:MM"')
    ap.add_argument("--replace", action="store_true", help="overwrite a visit id that already exists")


def upload_clip(clip, store_id, salesperson, visit_no, at, replace=False):
    """Clip → `recordings` bucket + `uploaded` visit row. Returns the row (what evaluate.process_visit takes)."""
    if not store.configured():
        raise ValueError("Supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    if not clip.is_file():
        raise ValueError(f"{clip}: no such file")
    mime = transcribe.mime_of(clip)
    if not mime.startswith(("video/", "audio/")):
        raise ValueError(f"{clip.name}: not a video or audio file ({mime})")
    try:
        started = datetime.datetime.strptime(at, "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo("Asia/Kolkata"))
    except ValueError:
        raise ValueError(f'--at must look like "2026-10-20 10:44", got {at!r}') from None
    visit_id = f"{store_id}-{visit_no}"
    # Re-adding a visit resets its analysis, so never do it to an existing visit by accident.
    if not replace and store.visit_exists(visit_id):
        raise ValueError(f"visit {visit_id} already exists; pick another --visit-no, or pass --replace")
    date = started.date().isoformat()
    # schemas.md: <store>/<date>/<store>_<salesperson>_<date>_<visitno>.<ext>
    media_path = f"{store_id}/{date}/{store_id}_{salesperson}_{date}_{visit_no}{clip.suffix.lower()}"

    store.upload(media_path, clip.read_bytes(), mime)
    store.add_visit(visit_id, store_id, salesperson, started.isoformat(), media_path)
    return {"id": visit_id, "store": store_id, "salesperson": salesperson, "recorded_at": started.isoformat(),
            "media_path": media_path}


if __name__ == "__main__":
    main()
