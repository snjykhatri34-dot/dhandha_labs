"""One clip, start to finish: (upload →) transcribe → evaluate → Supabase → owner message.

A local file (e.g. a clip shared in chat) is uploaded first:
    python3 pipeline/run_clip.py clip.mp4 --store B2 --salesperson Akshay --at "2026-10-20 10:44"
A clip already in Supabase (uploaded by the upload page) starts at step 2:
    python3 pipeline/run_clip.py --visit B2-1020

Does in one go what upload.py and evaluate.py --pending do separately, for this clip only:
  1. a local clip goes to the `recordings` bucket and a `visits` row is created as `uploaded`
  2. it is downloaded back from Supabase (the same path the upload page will use), and Gemini transcribes it,
     with each turn's role and tone; the transcript is saved to `visit_transcripts`
  3. the SOP scores it; the scorecard goes to `visits.analysis`, status `analysed` (or `failed`)
  4. if analysed, the owner's WhatsApp text goes to `visit_messages`
Then prints the transcript, the key scorecard fields and the message. Local copies land in --out.
Exit code 1 if the visit ended `failed`.
"""
import argparse
import datetime
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evaluate  # noqa: E402
import llm  # noqa: E402
import upload  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    upload.add_arguments(ap, required=False)
    ap.add_argument("--visit", help="a visit whose clip is already in Supabase, e.g. B2-1020 (no upload)")
    ap.add_argument("--out", default=str(llm.ROOT / "evaluator" / "runs" / datetime.date.today().isoformat()))
    ap.add_argument("--provider", choices=[p[0] for p in llm.PROVIDERS], help="provider for the SOP step")
    args = ap.parse_args()
    upload_args = (args.clip, args.store, args.salesperson, args.at)
    if bool(args.visit) == any(upload_args + (args.visit_no,)) or (not args.visit and not all(upload_args)):
        ap.error("give either --visit ID, or a clip with --store, --salesperson and --at (--visit-no optional)")
    llm.load_env()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    try:
        row = existing(args.visit) if args.visit else upload.upload_clip(
            Path(args.clip), args.store, args.salesperson, args.visit_no, args.at, args.replace)
    except (ValueError, upload.store.StoreError) as e:
        sys.exit(f"{'supabase' if args.visit else 'upload'}: {e}")
    if args.visit:
        print(f"1. clip already in Supabase: recordings/{row['media_path']}  (visit {row['id']}, was {row['status']})")
    else:
        print(f"1. uploaded  recordings/{row['media_path']}  → visit {row['id']} (uploaded)")

    entry = evaluate.process_visit(row, args.provider, out)
    visit_id = row["id"]
    readable = out / f"{visit_id}.readable.txt"
    if readable.exists():
        print(f"2. transcript saved to visit_transcripts ({llm.gemini_model()})\n")
        print(readable.read_text())
    if entry.get("error"):
        sys.exit(f"visit {visit_id} set to failed: {entry['error']}")

    card = json.loads((out / f"{visit_id}.json").read_text())
    print(f"3. scorecard saved to visits.analysis, status {entry['status']} [{entry['provider']}]")
    print(f"   outcome {card['outcome']} · reason {card['reason_not_bought']} · handling {card['handling_score']}/5"
          f" · arc {card['emotion_arc']}")
    for flag in card.get("flags") or []:
        print(f"   flag: {flag}")
    if entry["status"] != "analysed":
        print("   rule problems (a manager reviews before any message):")
        for p in entry["problems"]:
            print(f"   - {p}")
        sys.exit(1)
    print("4. owner message saved to visit_messages\n")
    print((out / f"{visit_id}.message.txt").read_text())


def existing(visit_id):
    """The row of a visit whose clip is already in the bucket."""
    if not upload.store.configured():
        raise ValueError("Supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    row = upload.store.get_visit(visit_id)
    if not row:
        raise ValueError(f"no visit {visit_id}")
    if not row.get("media_path"):
        raise ValueError(f"visit {visit_id} has no clip in the recordings bucket (media_path is empty)")
    return row


if __name__ == "__main__":
    main()
