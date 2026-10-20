# Shared contracts (agree on these in the first 10 minutes; change only together)

## Supabase
- Storage bucket: `recordings` (private). Path: `<store>/<date>/<store>_<salesperson>_<date>_<visitno>.mp4|m4a`
- Table `visits`:
  | column | type | notes |
  |---|---|---|
  | id | text, primary key | e.g. `B2-1014` |
  | store | text | B1 / B2 / B3 |
  | salesperson | text | from the upload form |
  | recorded_at | timestamptz | |
  | media_path | text | storage path |
  | status | text | `uploaded` → `analysed` → `failed` |
  | analysis | jsonb | the visit JSON below |

## Visit JSON (Workstream 2 writes; Workstream 3 reads)
```json
{
  "visit_id": "B2-1014", "store": "B2", "salesperson": "Akshay", "date": "2026-10-15",
  "outcome": "bought | deferred_with_follow_up | walked_out",
  "asked_for": {"category": "necklace", "weight_band": "20-35", "occasion": "office wear", "budget_inr": null},
  "shown": ["necklace 52 g"],
  "reason_not_bought": "weight_mismatch",
  "objections": [{"type": "weight", "at": "00:24", "quote": "That's far too heavy"}],
  "emotions": [{"at": "00:24", "who": "customer", "emotion": "disappointed", "cue": "words | voice | face"}],
  "emotion_arc": "interested -> frustrated",
  "handling_score": 2,
  "coaching_tip": "One sentence a manager can say.",
  "lost_demand": true,
  "flags": [],

  "customer": {"party": "solo | couple | family | group", "decision_maker": "customer", "intent": "high | medium | low", "intent_evidence": "00:09 named a weight and a use"},
  "key_moments": [{"at": "00:16", "by": "salesperson", "effect": "hurt | helped", "what": "showed 52 g after a 35 g ask"}],
  "missed_opportunities": [{"at": "01:02", "what": "no number taken to call when a lighter piece arrives"}],
  "next_step": null,
  "price_talk": {"making_pct": 18, "total_quoted_inr": null, "breakup_given": false, "notes": "rate called fixed at 00:50"},
  "not_available": [{"item": "necklace 20-35 g", "at": "01:02", "quote": "Not in that range right now, ma'am.", "said_by": "salesperson", "resolution": "none | another_branch | order | callback | alternative"}],
  "competitor": {"named": "another showroom", "claim": "12% making", "at": "00:44"}
}
```
The last seven fields (from `customer` to `competitor`) were added on 2026-10-20 for more nuance. `not_available` lists what the customer wanted that we said we don't have, so the report can count stock gaps separately from showing the wrong piece. Readers should treat them as optional, because older rows and `data/sample_day/` don't have them. `next_step` is `{"what", "when", "who"}` and is filled for every `deferred_with_follow_up` visit. `competitor` is `null` when no other shop was mentioned.

The 6 files in `expected_outputs/visits/` are hand-labelled examples. `data/sample_day/` holds 102 visits in a slimmer version of this shape, for building the report.

## MCP tools (Workstream 3): one query surface for the owner's agent
- `get_daily_report(date, store?)` → the daily report as markdown
- `search_visits(reason?, category?, salesperson?, store?, date_from?, date_to?)` → matching visit summaries with ids
- `lost_demand(date_from, date_to, store?)` → what customers asked for and didn't get (category + weight band, count, visit ids)
- `check_stock(category, weight_band, store?)` → on-hand vs planogram target per store, from `data/mock_erp/` (read-only; stands in for the ERP the owner's agent already connects to)
Every answer returns its sources (visit ids, tag numbers). Actions (transfers, reorders) are drafts for the owner, never executed.

## Daily report (Workstream 2)
Sections in order: Headline · Lost sales and why · Lost demand · Salespeople · Follow-ups due · Sources.
