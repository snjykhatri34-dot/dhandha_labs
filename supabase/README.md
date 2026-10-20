# Supabase (Stream 2)

Project: `dhandalabs_1` (ref `hhvylkdtqlkuolscmoux`). Both files below are already applied to it.

| File | What it does |
|---|---|
| `migrations/20261020160000_init.sql` | `visits`, `daily_reports`, `ux_visit_reviews`, `ux_notifications`; private `recordings` bucket |
| `seed.sql` | the 102 visits from `data/sample_day/` (regenerate with `python3 supabase/make_seed.py > supabase/seed.sql`) |

## Tables
- **`visits`**: as in `schemas.md`. `analysis` holds the scorecard JSON. Sample-day visits also carry `start`, `duration_min`, `competitor_mentioned` and `value_inr` inside `analysis`. `recorded_at` is the visit's start time (Asia/Kolkata).
- **`daily_reports`**: one row per `(report_date, store)`; `store = 'ALL'` for all stores. `numbers` has the same shape as `expected_outputs/daily_report_reference.json`. Inserting a row is the "report ready" signal.
- **`ux_visit_reviews`**, **`ux_notifications`**: the UX team's tables, as in `docs/ux-plan.md`.

## Access
RLS is on for every table with no policies, so only the service role key (server side) can read or write. The anon key sees nothing. Add policies if the browser ever needs to read directly.

## Checked against the reference
Querying the seeded `visits` reproduces every number in `daily_report_reference.json`: 102 visits, 42 bought, ₹11,926,399, the reasons breakdown, per-salesperson, B2 light necklaces 11/12, B3 exchange 5/14, 7 competitor mentions, busiest hours 19/18/17, 23 follow-ups.
