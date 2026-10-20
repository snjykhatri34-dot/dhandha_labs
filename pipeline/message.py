"""Step 3: one scored visit → a short WhatsApp message for the owner.

    python3 pipeline/message.py evaluator/runs/2026-10-20-clip/B2-1014.json

Built by code from the scorecard, no model call, so every line traces to a scorecard field and its timestamp.
It goes to the owner only (CLAUDE.md: nothing is sent to customers). Sending is the UX layer's job; this only
writes the text. The link is added when APP_BASE_URL is set.
"""
import argparse
import datetime
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import llm  # noqa: E402

OUTCOME = {"bought": "bought", "deferred_with_follow_up": "will come back", "walked_out": "walked out"}
OBJECTION = {"price_making_charge": "making charge", "price_budget": "over budget",
             "old_gold_exchange_rate": "old-gold rate", "purity_trust": "purity"}
RESOLUTION = {"none": "nothing offered", "another_branch": "offered from another branch", "order": "offered to order",
              "callback": "number taken", "alternative": "alternative shown"}


def _words(code):
    return code.replace("_", " ") if code else code


def _inr(amount):
    """₹1,50,000: Indian grouping (last three digits, then pairs)."""
    digits = str(int(amount))
    head, tail = digits[:-3], digits[-3:]
    while len(head) > 2:
        head, tail = head[:-2], f"{head[-2:]},{tail}"
    return f"₹{head},{tail}" if head else f"₹{tail}"


def _asked(asked):
    asked = asked or {}
    parts = [p for p in (asked.get("category"), asked.get("weight_band") and f"{asked['weight_band']} g") if p]
    if asked.get("occasion"):
        parts.append(f"for {asked['occasion']}")
    if asked.get("budget_inr"):
        parts.append(f"budget {_inr(asked['budget_inr'])}")
    return ", ".join(p for p in [" ".join(parts[:2])] + parts[2:] if p)


def visit_message(card, base_url=None):
    """The owner's WhatsApp text for one visit."""
    date = card.get("date")
    day = datetime.date.fromisoformat(date).strftime("%-d %b") if date else "date unknown"
    lines = [f"*{card['visit_id']} · {card['salesperson']} ({card['store']}) · {day}: "
             f"{OUTCOME.get(card['outcome'], _words(card['outcome']))}*"]
    if _asked(card.get("asked_for")):
        lines.append(f"• Wanted: {_asked(card['asked_for'])}")
    if card.get("shown"):
        lines.append(f"• Shown: {', '.join(card['shown'])}")
    if card.get("reason_not_bought"):
        lost = " (lost demand)" if card.get("lost_demand") else ""
        lines.append(f"• Why: {_words(card['reason_not_bought'])}{lost}")
    if card.get("objections"):
        lines.append("• Objections: " + ", ".join(
            f"{OBJECTION.get(o['type'], _words(o['type']))} @{o['at']}"
            + (" (cited another shop)" if o.get("competitor_mentioned") else "")
            for o in card["objections"]))
    for gap in card.get("not_available") or []:
        lines.append(f"• Not in stock: {gap['item']} @{gap['at']}, "
                     f"{RESOLUTION.get(gap.get('resolution'), _words(gap.get('resolution')))}")
    if card.get("emotion_arc"):
        lines.append(f"• Customer: {card['emotion_arc']}")
    lines.append(f"• Handling: {card['handling_score']}/5")
    step = card.get("next_step")
    if step:
        lines.append("• Follow-up: " + ", ".join(str(step[k]) for k in ("what", "when", "who") if step.get(k)))
    if card.get("coaching_tip"):
        lines.append(f"• Coach: {card['coaching_tip']}")
    if base_url:
        lines.append(f"{base_url.rstrip('/')}/owner/visits/{card['visit_id']}")
    lines.append("Scorecard pending manager review.")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scorecard")
    llm.load_env()
    print(visit_message(json.loads(Path(ap.parse_args().scorecard).read_text()), os.environ.get("APP_BASE_URL")))


if __name__ == "__main__":
    main()
