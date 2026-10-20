"""Build the daily report: numbers by code, words by the model.

    python3 pipeline/report.py                      # sample day, Oct 17
    python3 pipeline/report.py --visits file.json --scorecards evaluator/runs/2026-10-20-v3

Writes reports/<date>/numbers.json, daily_report.md (one page, for email) and owner_whatsapp.txt (short).
Every number comes from compute(); the model may only reword them. Stock transfers are drafts.
"""
import argparse
import collections
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import llm  # noqa: E402

ROOT = llm.ROOT
LOST_DEMAND = {"weight_mismatch", "design_not_available"}
BANDS = {
    "necklace": [(20, "0-20"), (35, "20-35"), (50, "35-50"), (None, "50+")],
    "earrings": [(8, "0-8"), (15, "8-15"), (None, "15+")],
    "ring": [(5, "0-5"), (10, "5-10"), (None, "10+")],
    "bangle": [(20, "0-20"), (40, "20-40"), (None, "40+")],
    "chain": [(15, "0-15"), (30, "15-30"), (None, "30+")],
    "pendant": [(5, "0-5"), (10, "5-10"), (None, "10+")],
}


def band_of(category, grams):
    for top, name in BANDS.get(category, []):
        if top is None or grams <= top:
            return name
    return None


def stock_check(category, weight_band):
    """On-hand vs planogram target per store, from data/mock_erp/ (read-only)."""
    erp = ROOT / "data" / "mock_erp"
    on_hand = collections.Counter()
    tags = collections.defaultdict(list)
    for row in csv.DictReader(open(erp / "stock_register.csv")):
        if row["category"] == category and row["status"] == "in_stock" \
                and band_of(category, float(row["net_wt_g"])) == weight_band:
            on_hand[row["branch"]] += 1
            tags[row["branch"]].append(row["tag_no"])
    targets = {r["branch"]: int(r["target_qty"]) for r in csv.DictReader(open(erp / "planogram_targets.csv"))
               if r["category"] == category and r["weight_band"] == weight_band}
    return {store: {"on_hand": on_hand[store], "target": target, "gap": on_hand[store] - target,
                    "tags": tags[store]}
            for store, target in sorted(targets.items())}


def compute(visits):
    not_bought = [v for v in visits if v["outcome"] != "bought"]
    reasons = collections.Counter(v["reason_not_bought"] for v in not_bought)
    by_store = {s: [sum(v["outcome"] == "bought" for v in vs), len(vs)]
                for s, vs in sorted(_group(visits, "store").items())}
    by_sp = sorted(([sp, sum(v["outcome"] == "bought" for v in vs), len(vs)]
                    for sp, vs in _group(visits, "salesperson").items()),
                   key=lambda r: (-r[1] / r[2], -r[2]))
    hours = collections.Counter(int(v["start"][:2]) for v in visits if v.get("start"))

    # Lost demand: what was asked for and lost, grouped by store + category + band.
    asks = collections.defaultdict(lambda: {"asks": 0, "lost": 0, "lost_ids": []})
    for v in visits:
        key = (v["store"], v["asked_for"]["category"], v["asked_for"].get("weight_band"))
        asks[key]["asks"] += 1
        if v["outcome"] != "bought" and v["reason_not_bought"] in LOST_DEMAND:
            asks[key]["lost"] += 1
            asks[key]["lost_ids"].append(v["visit_id"])
    lost_demand = sorted(({"store": s, "category": c, "weight_band": b, **n} for (s, c, b), n in asks.items()
                          if n["lost"]), key=lambda r: -r["lost"])

    # Store pattern: each store's top loss reasons (ties kept) and their share of that store's losses.
    store_pattern = {}
    for s, vs in sorted(_group(not_bought, "store").items()):
        counts = collections.Counter(v["reason_not_bought"] for v in vs)
        top = max(counts.values())
        store_pattern[s] = {"losses": len(vs), "top_reasons": [
            {"reason": r, "count": n, "ids": [v["visit_id"] for v in vs if v["reason_not_bought"] == r]}
            for r, n in counts.most_common() if n == top]}

    numbers = {
        "date": visits[0]["date"],
        "visits": len(visits),
        "bought": sum(v["outcome"] == "bought" for v in visits),
        "conversion_pct": round(100 * sum(v["outcome"] == "bought" for v in visits) / len(visits)),
        "sales_value_inr": sum(v.get("value_inr", 0) for v in visits),
        "reasons_not_bought": [[r, n] for r, n in reasons.most_common()],
        "reason_ids": {r: [v["visit_id"] for v in not_bought if v["reason_not_bought"] == r] for r in reasons},
        "by_store": by_store,
        "by_salesperson": by_sp,
        "lost_demand": lost_demand,
        "store_pattern": store_pattern,
        "competitor_mentions": sum(bool(v.get("competitor_mentioned")) for v in visits),
        "competitor_ids": [v["visit_id"] for v in visits if v.get("competitor_mentioned")],
        "busiest_hours": [[h, n] for h, n in hours.most_common(3)],
        "follow_ups_due": sum(v["outcome"] == "deferred_with_follow_up" for v in visits),
        "follow_up_ids": [v["visit_id"] for v in visits if v["outcome"] == "deferred_with_follow_up"],
    }
    top = lost_demand[0] if lost_demand else None
    if top:
        stock = stock_check(top["category"], top["weight_band"])
        need = -stock.get(top["store"], {"gap": 0})["gap"]
        transfer = []
        for s, row in sorted(stock.items(), key=lambda kv: -kv[1]["gap"]):
            if need <= 0 or s == top["store"] or row["gap"] <= 0:
                continue
            n = min(row["gap"], need)
            transfer.append({"from": s, "to": top["store"], "qty": n, "tags": row["tags"][:n]})
            need -= n
        numbers["top_lost_demand_stock"] = {"item": f"{top['category']} {top['weight_band']} g",
                                            "stock": stock, "draft_transfer": transfer}
    return numbers


def _group(visits, key):
    groups = collections.defaultdict(list)
    for v in visits:
        groups[v[key]].append(v)
    return groups


def check_against_reference(numbers, ref_path=ROOT / "expected_outputs" / "daily_report_reference.json"):
    ref = json.loads(ref_path.read_text())
    got = {
        "visits": numbers["visits"], "bought": numbers["bought"], "conversion_pct": numbers["conversion_pct"],
        "sales_value_inr": numbers["sales_value_inr"],
        "reasons_not_bought": sorted(map(tuple, numbers["reasons_not_bought"])),
        "by_store": numbers["by_store"], "by_salesperson": sorted(map(tuple, numbers["by_salesperson"])),
        "competitor_mentions": numbers["competitor_mentions"], "follow_ups_due": numbers["follow_ups_due"],
        "busiest_hours": sorted(map(tuple, numbers["busiest_hours"])),
    }
    want = dict(ref, reasons_not_bought=sorted(map(tuple, ref["reasons_not_bought"])),
                by_salesperson=sorted(map(tuple, ref["by_salesperson"])),
                busiest_hours=sorted(map(tuple, ref["busiest_hours"])))
    return [k for k in got if got[k] != want[k]]


WRITER = """You write the daily report for the owner of Verma Jewellers (3 stores: B1, B2, B3).
The owner reads it on a phone. He wants to know what to fix today, not every detail.

You get a JSON object of numbers already computed by code, plus optional scored example visits.
The example visits are recent recorded clips (each has its own date). They are not part of today's numbers:
use them only as coaching examples (what to copy, what to fix), cited with their visit id and timestamp.
Rules:
- Use only numbers and visit ids that appear in the input. Never compute, estimate or round differently.
- Every claim cites its source: visit ids (and a timestamp when an example visit gives one, e.g. B2-1015 @00:31).
- Each section ends with one action line starting with "→".
- Stock transfers are DRAFTS for the owner to approve. Never say they were done.
- Keep two things apart in Lost demand: "we didn't have it" (an example visit's not_available entry, or a
  store whose stock check shows 0 vs target) and "we didn't show it". Name the clips where the salesperson said
  we don't have the piece and offered nothing (resolution "none"): that is a stock gap plus a coaching moment.
- Coaching is about moments, not people's worth. No blame words.
- Plain English, short sentences. INR as ₹ with lakh/crore (₹1.19 crore).

Return ONE JSON object, no prose, no fences:
{"markdown": "<one-page report>", "whatsapp": "<owner summary>"}

markdown: sections in this order: **Headline** · **Lost sales and why** (a small table) · **Lost demand** (include the stock check and the draft transfer if given) · **Store pattern** · **Salespeople** (sold/visits, who needs coaching on what, who to copy) · **Busiest hours** · **Follow-ups due** · **Sources** (the visit ids per section).
whatsapp: at most 8 lines, WhatsApp formatting (*bold*, • bullets). Line 1 is the headline with visits, sales and conversion. Then the 3 most important actions for today, each one line with its number. End with "Full report in your inbox." No ids in the WhatsApp version."""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--visits", default=str(ROOT / "data" / "sample_day" / "visits_2026-10-17.json"))
    ap.add_argument("--scorecards", help="folder of full scorecards to use as coaching examples")
    ap.add_argument("--provider", choices=[p[0] for p in llm.PROVIDERS])
    args = ap.parse_args()

    visits = json.loads(Path(args.visits).read_text())
    numbers = compute(visits)
    mismatches = check_against_reference(numbers) if numbers["date"] == "2026-10-17" else []
    print("reference check:", "all numbers match" if not mismatches else f"MISMATCH in {mismatches}")
    if mismatches:
        sys.exit(1)

    examples = []
    if args.scorecards:
        for f in sorted(Path(args.scorecards).glob("*.json")):
            card = json.loads(f.read_text())
            if "key_moments" in card:
                examples.append({k: card.get(k) for k in ("visit_id", "date", "salesperson", "outcome",
                                                          "handling_score", "key_moments", "missed_opportunities",
                                                          "not_available", "coaching_tip")})
    user = json.dumps({"numbers": numbers, "example_visits": examples}, ensure_ascii=False)
    text, used = llm.complete(WRITER, user, only=args.provider)
    out = llm.parse_json(text)

    folder = ROOT / "reports" / numbers["date"]
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "numbers.json").write_text(json.dumps(numbers, indent=2, ensure_ascii=False) + "\n")
    (folder / "daily_report.md").write_text(out["markdown"].strip() + "\n")
    (folder / "owner_whatsapp.txt").write_text(out["whatsapp"].strip() + "\n")
    print(f"written by {used} to {folder}")


if __name__ == "__main__":
    main()
