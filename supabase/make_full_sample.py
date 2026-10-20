"""Turn the 102 slim sample-day visits into full scorecards (the B2-1014 format), with transcripts behind them.

    python3 supabase/make_full_sample.py            # writes data/sample_day/transcripts/ and scorecards/

For each visit in data/sample_day/visits_2026-10-17.json:
  1. a model writes a synthetic counter transcript that fits the visit's facts (outcome, reason, item,
     competitor, handling score, emotion arc),
  2. the real evaluator (evaluator/SOP.md) scores that transcript, so every quote and timestamp in the
     scorecard points at a line in a file,
  3. the scorecard must agree with the facts the daily report uses (outcome, reason, lost_demand, category,
     competitor); if not, the transcript is rewritten (up to 3 tries).
The sample-day fields the report needs (start, duration_min, value_inr, competitor_mentioned) are kept
inside the scorecard, as in the seed. Everything here is synthetic.
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
import evaluate  # noqa: E402
import llm  # noqa: E402

DAY = ROOT / "data" / "sample_day"
TRANSCRIPTS = DAY / "transcripts"
SCORECARDS = DAY / "scorecards"
EXTRAS = ("start", "duration_min", "value_inr", "competitor_mentioned")
EXAMPLES = ["B2_Priya_2026-10-15_1015.txt", "B2_Rohit_2026-10-17_1019.txt"]

WRITER = """You write one synthetic, realistic transcript of a conversation at a jewellery-store counter in
Solan, Himachal Pradesh (Verma Jewellers). English only. It will be used as test data for an evaluator.

Format, exactly like the examples: one line per turn, `[mm:ss] Speaker X: text`. Speaker A is the
salesperson and speaks first (a greeting). Other speakers are customers (B, C, ...). 8 to 16 lines,
timestamps rising, between 00:02 and 03:00. No names for speakers, no stage directions, no extra text.

The transcript must make these facts true, through what people say (never state them as labels):
- outcome: bought = the customer clearly agrees to buy; deferred_with_follow_up = they leave without buying
  but a concrete next step is said (a day or time to return, a callback with a number taken, a piece held);
  walked_out = they leave without buying and nothing concrete is set ("I'll think about it" is not a step).
- reason_not_bought (if not bought) is the main thing that ends the visit:
  weight_mismatch = the salesperson shows pieces of the wrong weight for the stated ask;
  design_not_available = the salesperson says the asked design or style isn't available, or never shows it;
  price_making_charge = pushback on the making charge; old_gold_exchange_rate = distrust of the exchange
  rate or deduction; purity_trust = doubts about purity, hallmark or HUID; family_decision = someone not
  present must decide; just_browsing = the customer says they're only looking.
- asked_for: the customer names the category, and the weight range if one is given, in words
  ("twenty to thirty-five grams"). For a bridal set, say the weight in grams; for a pendant, too.
- competitor_mentioned true: the customer cites another shop as part of the price/making-charge pushback.
  false: no other shop is mentioned at all.
- handling_score (1-5) shapes how the salesperson behaves: 5 = matches the ask, explains price openly,
  offers an alternative, sets the next step; 4 = clean but misses an add-on or follow-up; 3 = answers
  questions, doesn't persuade; 2 = defensive or vague on the key objection; 1 = ignores the ask or switches
  category.
- emotion_arc "<start> -> <end>": the customer's first line shows <start> and their last line shows <end>,
  through their words.
- If bought and value_inr is given, the salesperson quotes a total close to that amount (in lakh/thousand words
  or digits, e.g. "one lakh twelve thousand" or "1,12,000").

Vary the customers (solo, couple, family), occasions and wording. Keep it plausible and specific.
Never name a real business: other shops are "another showroom", "the shop in Shimla", "the other jeweller".
Never say a phone number, address or person's name aloud; a number is taken with a line like "Let me note your number."

Examples of the format:

"""


def facts_of(v):
    return {k: v[k] for k in ("outcome", "asked_for", "reason_not_bought", "competitor_mentioned",
                              "handling_score", "emotion_arc", "value_inr")}


def mismatches(card, v):
    want = {"outcome": v["outcome"], "reason_not_bought": v["reason_not_bought"],
            "lost_demand": v["lost_demand"], "category": v["asked_for"]["category"],
            "competitor": v["competitor_mentioned"]}
    got = {"outcome": card["outcome"], "reason_not_bought": card["reason_not_bought"],
           "lost_demand": card["lost_demand"], "category": card["asked_for"].get("category"),
           "competitor": card.get("competitor") is not None}
    return {k: {"want": want[k], "got": got[k]} for k in want if want[k] != got[k]}


def make_one(v, system):
    meta = {k: v[k] for k in ("visit_id", "store", "salesperson", "date")}
    feedback, last = "", None
    for attempt in range(3):
        user = f"Facts for visit {v['visit_id']}:\n{json.dumps(facts_of(v))}\n{feedback}\nWrite the transcript."
        transcript, _ = llm.complete(system, user, only="claude-cli")
        transcript = "\n".join(l.strip() for l in transcript.strip().splitlines() if l.strip().startswith("[")) + "\n"
        card, _, problems = evaluate.score(meta, transcript, provider="claude-cli")
        diff = mismatches(card, v)
        last = (transcript, card, problems, diff, attempt + 1)
        if not diff and not problems:
            break
        feedback = (f"\nA previous transcript was scored differently from the facts: {json.dumps(diff)}"
                    f"{' and broke rules: ' + json.dumps(problems) if problems else ''}. Make the facts unmistakable.")
    transcript, card, problems, diff, tries = last
    for k in EXTRAS:
        card[k] = v[k]
    return v["visit_id"], transcript, card, problems, diff, tries


def main():
    visits = json.loads((DAY / "visits_2026-10-17.json").read_text())
    only = set(sys.argv[1:])
    if only:
        visits = [v for v in visits if v["visit_id"] in only]
    system = WRITER + "\n\n".join((ROOT / "data" / "transcripts" / f).read_text() for f in EXAMPLES)
    TRANSCRIPTS.mkdir(exist_ok=True)
    SCORECARDS.mkdir(exist_ok=True)

    def run(v):
        try:
            return make_one(v, system)
        except Exception as e:  # report and carry on; rerun with the visit id to retry
            print(f"{v['visit_id']}: ERROR {e}", flush=True)
            return None

    report = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for result in pool.map(run, visits):
            if not result:
                continue
            visit_id, transcript, card, problems, diff, tries = result
            v = next(x for x in visits if x["visit_id"] == visit_id)
            name = f"{v['store']}_{v['salesperson']}_{v['date']}_{visit_id.split('-')[1]}"
            (TRANSCRIPTS / f"{name}.txt").write_text(transcript)
            (SCORECARDS / f"{visit_id}.json").write_text(json.dumps(card, indent=2, ensure_ascii=False) + "\n")
            report[visit_id] = {"tries": tries, "problems": problems, "fact_diffs": diff,
                                "score": [v["handling_score"], card["handling_score"]],
                                "band": [v["asked_for"]["weight_band"], card["asked_for"].get("weight_band")]}
            ok = "ok" if not diff and not problems else f"diffs={diff} problems={problems}"
            print(f"{visit_id}  tries={tries}  {ok}", flush=True)
    (SCORECARDS / "_report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
