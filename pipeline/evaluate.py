"""Run the evaluator SOP on transcripts and write one scorecard JSON per visit.

    python3 pipeline/evaluate.py                       # all of data/transcripts/
    python3 pipeline/evaluate.py --out evaluator/runs/x --provider gemini
    python3 pipeline/evaluate.py --supabase            # also upsert clean scorecards into `visits`

Each scorecard is validated against the SOP's hard rules; problems are listed in summary.json.
With --supabase, only scorecards with no rule problems are written; the rest are listed for review.
If hand labels exist in expected_outputs/visits/, the key fields are compared too.
"""
import argparse
import datetime
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import llm  # noqa: E402
import store  # noqa: E402
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
    """B2_Akshay_2026-10-15_1014.txt -> visit metadata."""
    store, salesperson, date, visitno = path.stem.split("_")
    return {"visit_id": f"{store}-{visitno}", "store": store, "salesperson": salesperson, "date": date}


def evaluate_one(path, provider=None):
    meta = metadata_from_name(path)
    transcript = path.read_text()
    user = (f"metadata: {json.dumps(meta)}\n"
            "observations: []\n\n"
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
    return meta["visit_id"], card, used, validate(card, transcript)


def compare(card, label):
    diffs = {}
    for name, get in KEY_FIELDS.items():
        a, b = get(label), get(card)
        if a == "unknown":
            a = None
        if a != b:
            diffs[name] = {"label": a, "got": b}
    return diffs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--transcripts", default=str(ROOT / "data" / "transcripts"))
    ap.add_argument("--out", default=str(ROOT / "evaluator" / "runs" / datetime.date.today().isoformat()))
    ap.add_argument("--provider", choices=[p[0] for p in llm.PROVIDERS])
    ap.add_argument("--supabase", action="store_true", help="upsert clean scorecards into the visits table")
    args = ap.parse_args()
    if args.supabase and not store.configured():
        sys.exit("--supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

    paths = sorted(Path(args.transcripts).glob("*.txt"))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda p: evaluate_one(p, args.provider), paths))

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


if __name__ == "__main__":
    main()
