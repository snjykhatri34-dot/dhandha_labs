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
    ap.add_argument("clip")
    ap.add_argument("--store", required=True, help="B1 / B2 / B3")
    ap.add_argument("--salesperson", required=True)
    ap.add_argument("--visit-no", required=True, help="e.g. 1014; the visit id becomes <store>-<visit-no>")
    ap.add_argument("--at", required=True, help='start of the visit, shop time: "YYYY-MM-DD HH:MM"')
    args = ap.parse_args()
    if not store.configured():
        sys.exit("Supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

    clip = Path(args.clip)
    mime = transcribe.mime_of(clip)
    if not mime.startswith(("video/", "audio/")):
        sys.exit(f"{clip.name}: not a video or audio file ({mime})")
    started = datetime.datetime.strptime(args.at, "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo("Asia/Kolkata"))
    date = started.date().isoformat()
    # schemas.md: <store>/<date>/<store>_<salesperson>_<date>_<visitno>.<ext>
    media_path = (f"{args.store}/{date}/{args.store}_{args.salesperson}_{date}_{args.visit_no}"
                  f"{clip.suffix.lower()}")
    visit_id = f"{args.store}-{args.visit_no}"

    store.upload(media_path, clip.read_bytes(), mime)
    store.add_visit(visit_id, args.store, args.salesperson, started.isoformat(), media_path)
    print(f"{visit_id}: uploaded to recordings/{media_path}; status `uploaded`")


if __name__ == "__main__":
    main()
