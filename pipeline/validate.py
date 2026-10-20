"""Check a scorecard against the SOP's hard rules. Returns a list of problems (empty = clean)."""
import re

OUTCOMES = {"bought", "deferred_with_follow_up", "walked_out"}
REASONS = {"weight_mismatch", "design_not_available", "price_making_charge", "old_gold_exchange_rate",
           "purity_trust", "family_decision", "just_browsing", "other"}
LOST_DEMAND_REASONS = {"weight_mismatch", "design_not_available"}
OBJECTIONS = {"weight", "design_not_available", "price_making_charge", "price_budget",
              "old_gold_exchange_rate", "purity_trust", "family_decision", "other"}
EMOTIONS = {"curious", "interested", "delighted", "satisfied", "relaxed", "reassured", "neutral",
            "concerned", "hesitant", "skeptical", "disappointed", "frustrated", "bored", "dismissive"}
CUES = {"words", "voice", "face"}
BANDS = {
    "necklace": {"0-20", "20-35", "35-50", "50+"},
    "earrings": {"0-8", "8-15", "15+"},
    "ring": {"0-5", "5-10", "10+"},
    "bangle": {"0-20", "20-40", "40+"},
    "chain": {"0-15", "15-30", "30+"},
}
REQUIRED = ["visit_id", "store", "salesperson", "date", "outcome", "asked_for", "shown", "reason_not_bought",
            "objections", "emotions", "emotion_arc", "handling_score", "coaching_tip", "lost_demand", "flags",
            "customer", "key_moments", "missed_opportunities", "next_step", "price_talk", "not_available",
            "competitor"]
RESOLUTIONS = {"none", "another_branch", "order", "callback", "alternative"}

LINE = re.compile(r"^\[(\d\d:\d\d)\]\s*([^:]+):\s*(.*)$")


def parse_transcript(text):
    """Return {timestamp: line text} for a `[mm:ss] Speaker X: text` transcript."""
    lines = {}
    for raw in text.splitlines():
        m = LINE.match(raw.strip())
        if m:
            lines[m.group(1)] = m.group(3)
    return lines


def _norm(s):
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')).strip().lower()


def validate(card, transcript_text, has_observations=False):
    problems = []
    lines = parse_transcript(transcript_text)
    stamps = set(lines)

    def at_ok(where, at):
        if at not in stamps:
            problems.append(f"{where}: timestamp {at} is not a transcript line")

    for key in REQUIRED:
        if key not in card:
            problems.append(f"missing field: {key}")
    if problems:
        return problems

    outcome, reason = card["outcome"], card["reason_not_bought"]
    if outcome not in OUTCOMES:
        problems.append(f"outcome not in list: {outcome}")
    if outcome == "bought" and reason is not None:
        problems.append("bought visit has a reason_not_bought")
    if outcome != "bought" and reason not in REASONS:
        problems.append(f"reason_not_bought not in list: {reason}")
    if card["lost_demand"] != (reason in LOST_DEMAND_REASONS):
        problems.append("lost_demand doesn't match reason_not_bought")

    asked = card["asked_for"]
    band, cat = asked.get("weight_band"), asked.get("category")
    if band is not None and cat in BANDS and band not in BANDS[cat]:
        problems.append(f"weight_band {band} is not a {cat} band")

    seen = set()
    for o in card["objections"]:
        if o.get("type") not in OBJECTIONS:
            problems.append(f"objection type not in list: {o.get('type')}")
        if o.get("type") in seen:
            problems.append(f"objection listed twice: {o.get('type')}")
        seen.add(o.get("type"))
        at_ok(f"objection {o.get('type')}", o.get("at"))
        quote, line = o.get("quote") or "", lines.get(o.get("at"), "")
        if _norm(quote).rstrip(".!?") not in _norm(line):
            problems.append(f"objection {o.get('type')}: quote not found verbatim at {o.get('at')}")

    for e in card["emotions"]:
        if e.get("emotion") not in EMOTIONS:
            problems.append(f"emotion not in list: {e.get('emotion')}")
        if e.get("cue") not in CUES:
            problems.append(f"cue not in list: {e.get('cue')}")
        if not has_observations and e.get("cue") != "words":
            problems.append(f"cue {e.get('cue')} without observations")
        at_ok(f"emotion {e.get('emotion')}", e.get("at"))
    ems = [e["emotion"] for e in card["emotions"]]
    expected_arc = f"{ems[0]} -> {ems[-1]}" if ems else None
    if card["emotion_arc"] != expected_arc:
        problems.append(f"emotion_arc {card['emotion_arc']!r} should be {expected_arc!r}")

    if card["handling_score"] not in (1, 2, 3, 4, 5):
        problems.append(f"handling_score not 1-5: {card['handling_score']}")

    moments = card["key_moments"]
    if not 2 <= len(moments) <= 4:
        problems.append(f"key_moments has {len(moments)} entries (want 2-4)")
    for m in moments:
        at_ok("key_moment", m.get("at"))
        if m.get("by") not in ("salesperson", "customer") or m.get("effect") not in ("helped", "hurt"):
            problems.append(f"key_moment at {m.get('at')}: bad by/effect")
    if moments and not any(m.get("by") == "salesperson" for m in moments):
        problems.append("key_moments has no salesperson move")
    for m in card["missed_opportunities"]:
        at_ok("missed_opportunity", m.get("at"))

    missed_at = {m.get("at") for m in card["missed_opportunities"]}
    for n in card["not_available"]:
        at_ok("not_available", n.get("at"))
        if _norm(n.get("quote") or "").rstrip(".!?") not in _norm(lines.get(n.get("at"), "")):
            problems.append(f"not_available {n.get('item')}: quote not found verbatim at {n.get('at')}")
        if n.get("resolution") not in RESOLUTIONS:
            problems.append(f"not_available resolution not in list: {n.get('resolution')}")
        if n.get("resolution") == "none" and n.get("at") not in missed_at:
            problems.append(f"not_available at {n.get('at')} has no matching missed_opportunity")

    if (outcome == "deferred_with_follow_up") != (card["next_step"] is not None):
        problems.append("next_step must be set for deferred visits and null otherwise")
    if card["competitor"] is not None:
        at_ok("competitor", card["competitor"].get("at"))
    customer = card["customer"] or {}
    if customer.get("party") not in ("solo", "couple", "family", "group"):
        problems.append(f"customer.party not in list: {customer.get('party')}")
    if customer.get("intent") not in ("high", "medium", "low"):
        problems.append(f"customer.intent not in list: {customer.get('intent')}")
    return problems
