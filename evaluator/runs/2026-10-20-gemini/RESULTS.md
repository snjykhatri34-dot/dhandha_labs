# Gemini fallback check: 2026-10-20

**Gemini model used: `gemini-3.8-flash`** (REST `generateContent`, temperature 0.2, `evaluator/SOP.md` unchanged).
Compared with the Claude run in `../2026-10-20-v4/` (`claude-opus-5-5` via the Claude Code CLI).

## Key and model access
- `GEMINI_API_KEY` is set in the environment and is valid. Listing models returns HTTP 200.
- The key is on the **free tier**. Every Pro model has a free-tier quota of 0 and returns HTTP 429 `RESOURCE_EXHAUSTED`: `gemini-3.1-pro-preview` (the value of `GEMINI_MODEL` in this environment), `gemini-pro-latest` and `gemini-4-argon`.
- `gemini-2.5-pro`, the old code default, returns **404 "no longer available to new users"**.
- `gemini-3.8-flash` works. `gemini-3.5-flash` also works but is served as `gemini-3.6-flash`. `gemini-3.7-flash` and `gemini-flash-latest` returned 503 (high demand) at the time of testing.
- Because the env var points at a model this key can't call, this run overrode it with `GEMINI_MODEL=gemini-3.8-flash`.

## Scorecards: Claude vs Gemini (6 transcripts)

| Visit | SOP rule problems (C / G) | Key-field diffs vs hand labels (C / G) | Nuance quality: Claude | Nuance quality: Gemini |
|---|---|---|---|---|
| B2-1014 | 0 / 0 | none / none | Specific tip cites 01:02 and the 30 g ask | key_moments and intent_evidence copied word for word from the SOP's worked example (this visit *is* the worked example); "no number taken" listed twice (01:02 and 01:08); generic tip |
| B2-1015 | 0 / 0 | none / none | Flags both weights stated (11 g vs 11.2 g) and the two quotes | Good; 1 flag; shorter, more generic "keep doing" tip |
| B2-1016 | 0 / 0 | none / none | Correct `shown` (necklace, chain with pendant, bangles); flags unclear speaker roles | **`shown` misses the chain and bangles** (SOP: "showed or named"); adds a debatable `design_not_available` objection at 00:36; no flags |
| B2-1017 | 0 / 0 | band null (expected) / same | Lists the missing price breakup as a missed opportunity | Missed opportunities empty; otherwise matches |
| B2-1018 | 0 / 0 | none / none | Tip cites 00:36, add-on plus number | Generic add-on tip, no timestamp |
| B2-1019 | 0 / 0 | none / none | 4 emotions (concerned → hesitant); flags the borderline outcome and the unclear decision maker | 2 emotions, arc stops at 00:28; decision_maker "the customer" with two customer speakers; intent "high" with no date or budget; tip says "instead of being defensive" (close to blame wording) |
| **Total** | **0 / 0** | **0 / 0 unexpected** | Specific, well flagged | Correct on structure, thinner on nuance, under-flags (3 flags in total vs 16) |

Summary: on everything `validate.py` and the hand labels check (outcome, reason, lost_demand, category, band, score, fixed lists, exact quotes, arc, not_available ⇔ missed opportunity), **Gemini 3.8 Flash ties Claude 6/6**. The nuance fields are where they differ. Gemini's coaching tips are generic and mostly carry no timestamp, it barely flags uncertainty, and it made one real error (`shown` in B2-1016).

## Daily report (`report/`, writer only; scorecards are Claude's v4; numbers by code)
- Numbers: the reference check passed. Code computes every number, so these are identical.
- Owner WhatsApp: Gemini's covers the same 3 actions (transfer, coaching, 23 follow-ups), but:
  - It **invents a "by 2:00 PM" deadline** that isn't in the input, and does the same in the report.
  - It drops the "B2 has 0, lost 11 of 12" reason that makes the transfer urgent.
  - It doubles the list markers ("• 1.").
  
  Claude's version is tighter, and every line traces back to the input.
- Report: Gemini's is longer (not one page). It adds an invented action ("Archive all referenced recordings and transaction logs"), and its "we did not show it" list mixes in a design_not_available visit (B1-1030).

## Fixes made (code only; `SOP.md` untouched)
- `pipeline/llm.py`:
  - The Gemini model is now read at call time, so `GEMINI_MODEL` in `.env` is honoured (it was read before `.env` was loaded).
  - The default changes from the retired `gemini-2.5-pro` to `gemini-3.8-flash`.
  - Retries on 500/503 and on 429s that ask for a short wait; fails fast on zero/daily quota.
  - Ignores `thought` parts.
  - Raises on a non-`STOP` finishReason instead of returning truncated JSON.
- `pipeline/report.py`: new `--out` flag, so a comparison run doesn't overwrite `reports/<date>/`.
- Gemini's reply shape caused no bugs: all 6 replies were plain JSON, no fences.

## SOP gaps Gemini exposed (suggestions only, need Sanjay's approval)
1. **The worked example is a test visit.** B2-1014 is both the SOP's worked example and one of the 6 eval transcripts, so it can't measure anything. Gemini copied its key_moments. Swap in a synthetic example that isn't in the eval set, or drop B2-1014 from scoring.
2. **The "don't copy" rule covers only `coaching_tip`.** Extend it to key_moments, intent_evidence and missed_opportunities.
3. **Duplicate missed opportunities.** Add "one entry per missed move": the mandatory `not_available` entry already covers "no number taken".
4. **`shown`.** Say explicitly that items named without a weight count (`"chain with pendant"`).
5. **Flag triggers.** List concrete cases that must be flagged: a borderline walked_out vs deferred, two or more customer speakers with unclear roles, a weight stated two ways.
6. **`decision_maker` with several customer speakers.** Require naming who leads, or `"unclear"` plus a flag.
7. **Coaching tip.** Require a timestamp in every tip (not only score 5). `validate.py` could then catch generic tips.

## Recommendation: when to use the fallback
- **Keep Claude as the primary evaluator and report writer.** It is more specific, flags more honestly, and its report invents nothing.
- **Use Gemini only as an outage fallback for scorecards.** Its key fields are reliable (6/6), so the day's numbers and lost demand stay right. Mark Gemini-made scorecards (the `provider` field in summary.json) for manager review before staff see the coaching tips.
- **Don't use Gemini Flash to write the owner report** unless Claude is down. If it must, check its text against the numbers, because it invented a deadline.
- **Re-test with Pro.** To test `gemini-3.1-pro-preview` (the video and audio path for Workstream 1 will want Pro), turn on billing for the Google AI Studio project. Until then, set `GEMINI_MODEL=gemini-3.8-flash` in the environment, or the fallback will fail with 429.
