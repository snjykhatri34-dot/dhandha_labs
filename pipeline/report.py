"""Build the daily report: numbers by code, words by the model.

    python3 pipeline/report.py                      # sample day, Oct 17
    python3 pipeline/report.py --visits file.json --scorecards evaluator/runs/2026-10-20-v3
    python3 pipeline/report.py --provider gemini --out evaluator/runs/x/report   # keep reports/ untouched
    python3 pipeline/report.py --supabase --date 2026-10-17   # visits from Supabase, report saved to daily_reports
    python3 pipeline/report.py --supabase --notify            # today (store time), then ask the app to send it

Writes reports/<date>/numbers.json, daily_report.md (one page, for email) and owner_whatsapp.txt (short).
With --supabase the day's analysed visits are read from the `visits` table, with their transcripts from
`visit_transcripts`, and the report is upserted into `daily_reports` (store 'ALL'): numbers, markdown, and actions
(one line per section, for the owner page). The transcripts' customer cues are counted into numbers.customer_mood
and the writer quotes them in the Customer mood section. evaluate.py --pending rebuilds the day's report this way
after every batch of clips, so the saved report is current whenever the app emails it.
With --notify, the app's /api/ux/notify (APP_BASE_URL) is called for the date; it sends at most once per report.
Every number comes from compute(); the model may only reword them. Stock transfers are drafts.
"""
import argparse
import collections
import csv
import datetime
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import llm  # noqa: E402
import store  # noqa: E402

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
    # Visit-id order, so ties (two reasons with 9 visits) come out the same whatever order rows arrive in.
    visits = sorted(visits, key=lambda v: v["visit_id"])
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


def _customer_speakers(turns):
    return {t.get("speaker") for t in turns if t.get("role") == "customer"}


def customer_cues(transcript):
    """The customer's voice/face cues in one transcript, in clip order: [{at, emotion, cue, description}]."""
    customers = _customer_speakers(transcript.get("turns") or [])
    cues = [{"at": o.get("at"), "emotion": o["candidate_emotion"], "cue": o.get("cue_type"),
             "description": o.get("description")}
            for o in transcript.get("observations") or []
            if o.get("candidate_emotion") and str(o.get("who", "")).removeprefix("Speaker ").strip() in customers]
    return sorted(cues, key=lambda c: c["at"] or "")


def customer_mood(transcripts):
    """Customer emotions across the day's transcripts, counted by code like every other number.

    emotions: every customer cue; ended: each visit's last customer cue (how the customer left the counter).
    """
    seen, ended = collections.defaultdict(list), collections.defaultdict(list)
    for visit_id, t in sorted(transcripts.items()):
        cues = customer_cues(t)
        for c in cues:
            seen[c["emotion"]].append(visit_id)
        if cues:
            ended[cues[-1]["emotion"]].append(visit_id)

    def ranked(groups):
        return sorted(([e, len(ids)] for e, ids in groups.items()), key=lambda r: (-r[1], r[0]))

    return {
        "transcripts": len(transcripts),
        "visits_with_cues": sum(len(ids) for ids in ended.values()),
        "emotions": ranked(seen),
        "emotion_ids": {e: sorted(set(ids)) for e, ids in seen.items()},
        "ended": ranked(ended),
        "ended_ids": dict(ended),
    }


def transcript_evidence(transcripts):
    """What the writer may quote: each visit's customer turns (time, tone, words) and customer cues."""
    out = []
    for visit_id, t in sorted(transcripts.items()):
        customers = _customer_speakers(t.get("turns") or [])
        out.append({"visit_id": visit_id,
                    "customer_said": [{"at": x.get("at"), "tone": x.get("tone"), "text": (x.get("text") or "")[:240]}
                                      for x in t.get("turns") or [] if x.get("speaker") in customers],
                    "customer_cues": customer_cues(t)})
    return out


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

You get a JSON object of numbers already computed by code, plus optional scored example visits and the day's
transcripts (each visit's customer turns with their tone, and the customer's voice/face cues).
The example visits are recorded clips with full scorecards (each has its own date; the numbers already count any
from this date). Use them only as coaching examples (what to copy, what to fix), cited with their visit id and timestamp.
Rules:
- Use only numbers and visit ids that appear in the input. Never compute, estimate or round differently.
- Every claim cites its source: visit ids (and a timestamp when an example visit gives one, e.g. B2-1015 @00:31).
- Each section ends with one action line starting with "→".
- Stock transfers are DRAFTS for the owner to approve. Never say they were done.
- Keep two things apart in Lost demand: "we didn't have it" (an example visit's not_available entry, or a
  store whose stock check shows 0 vs target) and "we didn't show it". Name the clips where the salesperson said
  we don't have the piece and offered nothing (resolution "none"): that is a stock gap plus a coaching moment.
- Customer mood: counts come only from numbers.customer_mood (emotions = every customer cue, ended = each visit's
  last cue). Quote the transcripts for the why: a customer line or cue with its visit id and timestamp
  (B2-1108 @00:46). Link a mood to a moment (what the salesperson did just before), not to a person.
  If numbers.customer_mood has no cues, write one line saying the day's clips had no emotion cues.
- Coaching is about moments, not people's worth. No blame words.
- Plain English, short sentences. INR as ₹ with lakh/crore (₹1.19 crore).

Return ONE JSON object, no prose, no fences:
{"markdown": "<one-page report>", "whatsapp": "<owner summary>", "actions": {<section key>: "<action line>"}}

markdown: sections in this order: **Headline** · **Lost sales and why** (a small table) · **Lost demand** (include the stock check and the draft transfer if given) · **Store pattern** · **Salespeople** (sold/visits, who needs coaching on what, who to copy) · **Customer mood** (how customers felt and how they left, with the moments behind it) · **Busiest hours** · **Follow-ups due** · **Sources** (the visit ids per section).
whatsapp: at most 8 lines, WhatsApp formatting (*bold*, • bullets). Line 1 is the headline with visits, sales and conversion. Then the 3 most important actions for today, each one line with its number. End with "Full report in your inbox." No ids in the WhatsApp version.
actions: the markdown's "→" action lines, word for word without the arrow, keyed by section:
headline, lostSales, lostDemand, storePattern, salespeople, customerMood, busiestHours, followUps. Leave out a section with no action."""

ACTION_KEYS = ("headline", "lostSales", "lostDemand", "storePattern", "salespeople", "customerMood", "busiestHours",
               "followUps")


def clean_actions(raw):
    """Only the known section keys, one line each, without the arrow."""
    raw = raw if isinstance(raw, dict) else {}
    return {k: " ".join(str(raw[k]).split()).lstrip("→ ").strip() for k in ACTION_KEYS
            if isinstance(raw.get(k), str) and raw[k].strip()}


def store_today():
    return datetime.datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()


def notify(date):
    """Ask the app to send the owner the report. The app records it in ux_notifications and sends once."""
    base = os.environ.get("APP_BASE_URL", "").rstrip("/")
    if not base:
        raise SystemExit("--notify needs APP_BASE_URL (the deployed app)")
    req = urllib.request.Request(f"{base}/api/ux/notify", method="POST", data=json.dumps({"date": date}).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            reply = json.loads(resp.read())
    except urllib.error.HTTPError as e:  # the report is saved; only the send failed
        raise SystemExit(f"notify: HTTP {e.code}: {e.read()[:300].decode(errors='replace')}")
    print("notify:", reply.get("result") or reply.get("error"), reply.get("channel", ""))


def write_report(visits, transcripts=None, scorecards=None, provider=None, out=None, supabase=False, notify_owner=False):
    """Numbers by code, words by the model; write reports/<date>/ (or `out`), and with supabase save daily_reports.

    transcripts: {visit_id: visit_transcripts row}; their customer cues become numbers.customer_mood and the writer
    may quote them. scorecards: full scorecards to use as coaching examples (default: the visits themselves).
    """
    numbers = compute(visits)
    mismatches = check_against_reference(numbers) if numbers["date"] == "2026-10-17" else []
    print("reference check:", "all numbers match" if not mismatches else f"MISMATCH in {mismatches}")
    if mismatches:
        sys.exit(1)
    transcripts = transcripts or {}
    numbers["customer_mood"] = customer_mood(transcripts)

    # Coaching examples: full scorecards (with key moments), e.g. the day's own clips.
    examples = [{k: card.get(k) for k in ("visit_id", "date", "salesperson", "outcome", "handling_score",
                                          "key_moments", "missed_opportunities", "not_available", "coaching_tip")}
                for card in (scorecards if scorecards is not None else visits) if "key_moments" in card]
    user = json.dumps({"numbers": numbers, "example_visits": examples,
                       "transcripts": transcript_evidence(transcripts)}, ensure_ascii=False)
    text, used = llm.complete(WRITER, user, only=provider)
    out_json = llm.parse_json(text)

    folder = Path(out) if out else ROOT / "reports" / numbers["date"]
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "numbers.json").write_text(json.dumps(numbers, indent=2, ensure_ascii=False) + "\n")
    (folder / "daily_report.md").write_text(out_json["markdown"].strip() + "\n")
    (folder / "owner_whatsapp.txt").write_text(out_json["whatsapp"].strip() + "\n")
    actions = clean_actions(out_json.get("actions"))
    (folder / "actions.json").write_text(json.dumps(actions, indent=2, ensure_ascii=False) + "\n")
    print(f"written by {used} to {folder}")

    if supabase:
        report_id = store.upsert_report(numbers["date"], numbers, out_json["markdown"].strip(), actions)
        print(f"supabase: daily_reports {numbers['date']} ALL saved ({report_id})")
        if notify_owner:
            notify(numbers["date"])
    return numbers


def report_for_date(date, provider=None, out=None, notify_owner=False, scorecards=None):
    """The day's analysed visits and their transcripts from Supabase → daily_reports. None if there were no visits.

    evaluate.py --pending calls this after each batch of clips, so the saved report (which the app's owner email
    reads) always covers every clip analysed so far that day.
    """
    visits = store.visits_for_date(date)
    print(f"supabase: {len(visits)} analysed visit(s) on {date}")
    if not visits:
        print("no visits, no report")
        return None
    transcripts = store.transcripts_for([v["visit_id"] for v in visits])
    print(f"supabase: {len(transcripts)} transcript(s) on {date}")
    return write_report(visits, transcripts, scorecards, provider, out, supabase=True, notify_owner=notify_owner)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--visits", help="visits JSON file (default: the sample day, or Supabase with --supabase)")
    ap.add_argument("--supabase", action="store_true",
                    help="read the day's analysed visits and transcripts from Supabase and save the report to daily_reports")
    ap.add_argument("--date", help="report date with --supabase (default: today in store time)")
    ap.add_argument("--notify", action="store_true", help="after saving, ask the app to send the owner the report")
    ap.add_argument("--scorecards", help="folder of full scorecards to use as coaching examples")
    ap.add_argument("--provider", choices=[p[0] for p in llm.PROVIDERS])
    ap.add_argument("--out", help="output folder (default reports/<date>)")
    args = ap.parse_args()
    if (args.supabase or args.notify) and not store.configured():
        sys.exit("--supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    if args.notify and not args.supabase:
        sys.exit("--notify needs --supabase (the app sends the saved report)")

    cards = ([json.loads(f.read_text()) for f in sorted(Path(args.scorecards).glob("*.json"))] if args.scorecards
             else None)
    if args.supabase and not args.visits:
        report_for_date(args.date or store_today(), args.provider, args.out, args.notify, cards)
        return
    visits = json.loads(Path(args.visits or ROOT / "data" / "sample_day" / "visits_2026-10-17.json").read_text())
    cards = cards or []  # a visits file is not full scorecards: no examples unless --scorecards
    write_report(visits, scorecards=cards, provider=args.provider, out=args.out, supabase=args.supabase,
                 notify_owner=args.notify)


if __name__ == "__main__":
    main()
