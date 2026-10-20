# Supabase (Stream 2)

Project: `dhandalabs_1` (ref `hhvylkdtqlkuolscmoux`). Both files below are already applied to it.

| File | What it does |
|---|---|
| `migrations/20261020160000_init.sql` | `visits`, `daily_reports`, `ux_visit_reviews`, `ux_notifications`; private `recordings` bucket |
| `make_full_sample.py` | Upgrades the 102 sample visits to full scorecards (the B2-1014 format): writes a synthetic transcript per visit (`data/sample_day/transcripts/`), scores it with the real SOP (`data/sample_day/scorecards/`), and checks the facts the report uses still match. Loaded into `visits` on 2026-10-20. |
| `seed.sql` | the 102 visits from `data/sample_day/` (regenerate with `python3 supabase/make_seed.py > supabase/seed.sql`) |

## Tables
- **`visits`**: as in `schemas.md`. `analysis` holds the scorecard JSON. Sample-day visits also carry `start`, `duration_min`, `competitor_mentioned` and `value_inr` inside `analysis`. `recorded_at` is the visit's start time (Asia/Kolkata).
- **`daily_reports`**: one row per `(report_date, store)`; `store = 'ALL'` for all stores. `numbers` has the same shape as `expected_outputs/daily_report_reference.json`. Inserting a row is the "report ready" signal.
- **`ux_visit_reviews`**, **`ux_notifications`**: the UX team's tables, as in `docs/ux-plan.md`.

## What's in `visits` now (2026-10-20)
- 102 sample-day visits (17 Oct): full scorecards from `data/sample_day/scorecards/`, each backed by a synthetic transcript, plus the sample-day fields (`start`, `duration_min`, `value_inr`, `competitor_mentioned`). The 17 Oct numbers still match `daily_report_reference.json`. Handling scores are the evaluator's (they differ from the old slim file in 52 visits, mostly by one point); bridal sets and pendants have no weight band and pendants no category, as the SOP requires.
- 6 recorded test visits B2-1014 to B2-1019, dated **2026-10-20** (today): scorecards from `evaluator/runs/2026-10-20-v4/` (B2-1014 from a fresh run). No `recorded_at` or media.

## Access
RLS is on for every table with no policies, so only the service role key (server side) can read or write. The anon key sees nothing. Add policies if the browser ever needs to read directly.

## Checked against the reference
Querying the seeded `visits` reproduces every number in `daily_report_reference.json`: 102 visits, 42 bought, ₹11,926,399, the reasons breakdown, per-salesperson, B2 light necklaces 11/12, B3 exchange 5/14, 7 competitor mentions, busiest hours 19/18/17, 23 follow-ups.
