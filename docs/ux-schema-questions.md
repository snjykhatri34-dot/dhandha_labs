# UX → Stream 2 (Sanjay): schema questions

We haven't changed `schemas.md`. These are the gaps we hit while building the UX. Please reply inline or tell Shinjini.

1. **Field names in the hand labels.** `expected_outputs/visits/*.json` use `branch` and `customer_sentiment_arc`, while `schemas.md` uses `store` and `emotion_arc`. Which names will the `visits.analysis` jsonb use? We're assuming the `schemas.md` names.
2. **Emotion `cue` format.** `schemas.md` has a bare `words | voice | face`, but the labels have `"words: 'That's far too heavy'"`. Will the cue be `"<type>: <evidence>"`? The UX shows both parts.
3. **Sample-day-only fields.** `start`, `duration_min`, `competitor_mentioned` and `value_inr` are in the 102 sample visits but not in the visit JSON. Will real visits have them, either in `analysis` or as columns? The report's busiest hours and sales value depend on them.
4. **Report storage.** How will the daily report be stored: a table (e.g. `daily_reports(date, store, numbers jsonb, markdown text, created_at)`) or generated on demand? The owner view needs the **numbers** (the same shape as `daily_report_reference.json`) and the **action lines**.
5. **"Report ready" signal.** Will a row insert into a reports table signal it? We'd attach a Supabase webhook to call `/api/ux/notify` (Ayse).
6. **Our own tables.** Can we add `ux_visit_reviews` and `ux_notifications` through your migrations folder? Where will it live?
7. **Upload → visit row.** When a clip is uploaded, does the UX insert the `visits` row (status `uploaded`), or does Stream 1 or 2 do it? And who generates the `id` (e.g. `B2-1020`)?
