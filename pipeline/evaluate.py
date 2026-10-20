"""Run the evaluator SOP and write one scorecard JSON per visit.

    python3 pipeline/evaluate.py                       # all of data/transcripts/
    python3 pipeline/evaluate.py --out evaluator/runs/x --provider gemini
    python3 pipeline/evaluate.py --supabase            # also upsert clean scorecards into `visits`
    python3 pipeline/evaluate.py --clips data/recordings   # video/audio: Gemini transcribes, then the SOP
    python3 pipeline/evaluate.py --pending             # every `uploaded` visit in Supabase, end to end

Clips go through pipeline/transcribe.py first (Gemini: transcript + voice/face cues), and the cues are passed
to the SOP as `observations`. The transcript and cues are saved next to each scorecard.
Each scorecard is validated against the SOP's hard rules; problems are listed in summary.json.
With --supabase, only scorecards with no rule problems are written; the rest are listed for review.
With --pending, a clean scorecard sets the visit to `analysed`; rule problems or errors set it to `failed`.
If hand labels exist in expected_outputs/visits/, the key fields are compared too.
"""
import argparse
import datetime
import json
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import llm  # noqa: E402
import store  # noqa: E402
import transcribe  # noqa: E402
from validate import validate  # noqa: E402

ROOT = llm.ROOT
SOP = ROOT / "evaluator" / "SOP.md"
KEY_FIELDS = {
    "outcome": lambda d: d["outcome"],
    "reason_not_bought": lambda d: d["reason_not_bought"],
    "lost_demand": lambda d: d["lost_demand"],
    "category": lambda d: d["asked_for"]["category"],
    "weight_band": lambda d: d["asked_for"].get("weight_band"),
    "handling_score": lambda d: d["handling_score"],
}


def metadata_from_name(path):
    """B2_Akshay_2026-10-15_1014.txt (or .mp4, the storage name) -> visit metadata."""
    store_id, salesperson, date, visitno = path.stem.split("_")
    return {"visit_id": f"{store_id}-{visitno}", "store": store_id, "salesperson": salesperson, "date": date}


def score(meta, transcript, observations=(), provider=None):
    """Run the SOP on one transcript. Returns (card, provider used, rule problems)."""
    user = (f"metadata: {json.dumps(meta)}\n"
            f"observations: {json.dumps(list(observations), ensure_ascii=False)}\n\n"
            f"transcript:\n{transcript}")
    system = SOP.read_text()
    last_error = None
    for _ in range(2):  # one retry if the reply isn't valid JSON
        text, used = llm.complete(system, user, only=provider)
        try:
            card = llm.parse_json(text)
            break
        except json.JSONDecodeError as e:
            last_error = e
    else:
        raise llm.LLMError(f"{meta['visit_id']}: no valid JSON after retry ({last_error})")
    return card, used, validate(card, transcript, has_observations=bool(observations))


def evaluate_one(path, meta, provider=None, out=None):
    """Score one transcript (.txt) or clip (video/audio). Returns (card, provider, problems)."""
    if path.suffix == ".txt":
        return score(meta, path.read_text(), provider=provider)
    heard = transcribe.transcribe(path)
    if out:
        (out / f"{meta['visit_id']}.transcript.txt").write_text(heard["transcript"])
        (out / f"{meta['visit_id']}.cues.json").write_text(
            json.dumps({"observations": heard["observations"], "flags": heard["flags"]}, indent=2,
                       ensure_ascii=False) + "\n")
    card, used, problems = score(meta, heard["transcript"], heard["observations"], provider)
    # What the transcriber couldn't hear or see clearly is a reason to doubt the scorecard too.
    card["flags"] = list(card.get("flags") or []) + [f"transcript: {f}" for f in heard["flags"]]
    return card, f"gemini-media+{used}", problems


def compare(card, label):
    diffs = {}
    for name, get in KEY_FIELDS.items():
        a, b = get(label), get(card)
        if a == "unknown":
            a = None
        if a != b:
            diffs[name] = {"label": a, "got": b}
    return diffs


def run_files(paths, args, out):
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(
            lambda p: (metadata_from_name(p)["visit_id"], *evaluate_one(p, metadata_from_name(p), args.provider, out)),
            paths))

    summary = {}
    for (visit_id, card, used, problems), path in zip(results, paths):
        (out / f"{visit_id}.json").write_text(json.dumps(card, indent=2, ensure_ascii=False) + "\n")
        entry = {"provider": used, "problems": problems}
        label_path = ROOT / "expected_outputs" / "visits" / f"{path.stem}.json"
        if label_path.exists():
            entry["vs_label"] = compare(card, json.loads(label_path.read_text()))
        summary[visit_id] = entry
        status = "clean" if not problems else f"{len(problems)} problem(s)"
        diffs = entry.get("vs_label", {})
        print(f"{visit_id}  [{used}]  rules: {status}  label diffs: {diffs or 'none'}")
        for p in problems:
            print(f"    - {p}")
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(f"\nwrote {len(results)} scorecards to {out}")

    if args.supabase:
        clean = [card for _, card, _, problems in results if not problems]
        held = [visit_id for visit_id, _, _, problems in results if problems]
        if clean:
            print("supabase: upserted", ", ".join(store.upsert_visits(clean)))
        if held:
            print("supabase: not written (rule problems, review first):", ", ".join(held))


def run_pending(args, out):
    """Every `uploaded` visit in Supabase: download the clip, transcribe, score, write back."""
    rows = store.pending_visits()
    print(f"{len(rows)} uploaded visit(s) waiting")
    summary = {}
    for row in rows:
        visit_id = row["id"]
        recorded = row.get("recorded_at")
        date = (datetime.datetime.fromisoformat(recorded).astimezone(ZoneInfo("Asia/Kolkata")).date().isoformat()
                if recorded else None)
        meta = {"visit_id": visit_id, "store": row["store"], "salesperson": row["salesperson"], "date": date}
        try:
            if not row.get("media_path"):
                raise store.StoreError("visit has no media_path")
            with tempfile.TemporaryDirectory() as tmp:
                clip = Path(tmp) / Path(row["media_path"]).name
                clip.write_bytes(store.download(row["media_path"]))
                card, used, problems = evaluate_one(clip, meta, args.provider, out)
        except Exception as e:  # one bad clip must not stop the rest, and must not stay "uploaded"
            store.mark_failed(visit_id)
            summary[visit_id] = {"error": str(e)}
            print(f"{visit_id}  FAILED: {e}")
            continue
        if problems:
            card["flags"] = list(card["flags"]) + [f"rule check: {p}" for p in problems]
        status = "failed" if problems else "analysed"
        store.upsert_visits([card], status=status)
        (out / f"{visit_id}.json").write_text(json.dumps(card, indent=2, ensure_ascii=False) + "\n")
        summary[visit_id] = {"provider": used, "problems": problems, "status": status}
        print(f"{visit_id}  [{used}]  {status}" + (f" ({len(problems)} rule problem(s))" if problems else ""))
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")


def main():
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--transcripts", default=str(ROOT / "data" / "transcripts"))
    src.add_argument("--clips", help="folder of video/audio clips named like the storage path")
    src.add_argument("--pending", action="store_true", help="process every `uploaded` visit in Supabase")
    ap.add_argument("--out", default=str(ROOT / "evaluator" / "runs" / datetime.date.today().isoformat()))
    ap.add_argument("--provider", choices=[p[0] for p in llm.PROVIDERS], help="provider for the SOP step")
    ap.add_argument("--supabase", action="store_true", help="upsert clean scorecards into the visits table")
    args = ap.parse_args()
    if (args.supabase or args.pending) and not store.configured():
        sys.exit("Supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.pending:
        run_pending(args, out)
    elif args.clips:
        run_files(sorted(p for p in Path(args.clips).iterdir() if p.suffix.lower() in transcribe.MEDIA_TYPES),
                  args, out)
    else:
        run_files(sorted(Path(args.transcripts).glob("*.txt")), args, out)


if __name__ == "__main__":
    main()
