# UX layer: decisions and repo facts (read first)

These override `docs/ux-plan.md` where they differ.

## Team
- **Person A (Ayse):** upload flow, WhatsApp push. Plan: `docs/ux/person-A-build-plan.md`
- **Person B (Shinjini):** platform base, owner view, manager review, polish. Plan: `docs/ux/person-B-build-plan.md`
- **Stream 2 (Sanjay):** Supabase `visits` table, daily report builder, Resend email.
- **Stream 3 (MCP server): not being built.** The UX team owns the Next.js app at the repo root.

## Decisions
1. **One Next.js app at the repo root**, created by Shinjini's `ux/foundation` PR. Our pages live in `app/(ux)/`. If an MCP server is added later, it goes in the same app (e.g. `app/api/mcp/`).
2. **Visit status follows `schemas.md`:** `uploaded → analysed → failed`. "Analysing" is a UI label for `uploaded` while analysis runs. It isn't a stored status.
3. **Report sections follow `schemas.md` and `expected_outputs/daily_report_expected.md`:** Headline · Lost sales and why · Lost demand · Store pattern · Salespeople · Busiest hours · Follow-ups due · Sources. Each one ends in an action.
4. **The test oracle is `expected_outputs/daily_report_reference.json`.** All of its numbers can be recomputed from `data/sample_day/visits_2026-10-17.json`. The mock report is computed from the visits, not hard-coded, and a test checks it against the reference.
5. **Mock data is read from where it already lives** (`data/`, `expected_outputs/`). It isn't copied.
6. **Review status lives in our own table**, `ux_visit_reviews`, because we never add columns to `visits`. In mock mode it's kept in memory.
7. **No real auth.** A role switch (owner / manager / staff) is stored in a cookie.

## Data shapes seen in the repo
| Source | Shape | Notes |
|---|---|---|
| `schemas.md` visit JSON | full scorecard | uses `store`, `emotion_arc`, `cue: "words \| voice \| face"` |
| `expected_outputs/visits/*.json` (6 hand labels) | full scorecard, slightly different | uses `branch` not `store`, `customer_sentiment_arc` not `emotion_arc`, `cue` like `"words: 'That's far too heavy'"`, adds `handling_evidence`, `note` |
| `data/sample_day/*.json` (102 visits) | slim | adds `start`, `duration_min`, `competitor_mentioned`, `value_inr`; no objections/emotions/coaching |

The mock layer normalises all three into one `Visit` type. Fields a source doesn't have are left empty, never invented. Open questions for Sanjay are in `docs/ux-schema-questions.md`.
