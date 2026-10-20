# Pipeline (Stream 2)

```
clip (Supabase `recordings`) ──transcribe.py (Gemini: words + voice/face cues)──▶ transcript + observations
transcript ──evaluate.py──▶ scorecard JSON ──(Supabase visits.analysis)──▶ report.py ──▶ daily report + owner WhatsApp
             (SOP = system prompt)          validate.py checks the SOP rules     (numbers by code, words by model)
```

| File | What it does |
|---|---|
| `llm.py` | One call surface for every model: Claude SDK (if `ANTHROPIC_API_KEY`), then the Claude Code CLI (no key needed in a Claude Code session), then Gemini (if `GEMINI_API_KEY`; model from `GEMINI_MODEL`, default `gemini-3.8-flash`, since Pro needs a billed key). The first one that works wins. |
| `transcribe.py` | Step 1: sends a video/audio clip to Gemini with `evaluator/TRANSCRIBE.md` and returns `[mm:ss] Speaker X:` lines plus voice/face `observations` (the SOP's input). Clips up to 70 MB go inline; bigger ones through the Gemini Files API. |
| `evaluate.py` | Runs `evaluator/SOP.md` on every transcript in `data/transcripts/`, validates each scorecard, compares the key fields with `expected_outputs/visits/`, and writes `evaluator/runs/<date>/`. |
| `store.py` | Upserts scorecards into the Supabase `visits` table (REST, service role key). Used by `evaluate.py --supabase`; only scorecards with no rule problems are written. |
| `validate.py` | The SOP's hard rules as code: fixed lists, exact quotes, real timestamps, arc = first→last emotion, lost_demand ⇔ reason, and every stock gap left unresolved has a matching missed opportunity. |
| `report.py` | Computes the day's numbers (checked against `daily_report_reference.json`), checks stock in `data/mock_erp/`, drafts a transfer, then has the model write the one-page report and the owner WhatsApp. Writes `reports/<date>/`. |

## Run

```bash
pip install anthropic                     # only needed for the API-key path
python3 pipeline/evaluate.py              # scorecards for all transcripts
python3 pipeline/report.py --scorecards evaluator/runs/2026-10-20-v4
python3 pipeline/evaluate.py --provider gemini   # force a provider
python3 pipeline/evaluate.py --supabase          # also write clean scorecards to Supabase `visits`
python3 pipeline/evaluate.py --clips data/recordings   # clips: Gemini transcribes, then the SOP scores
python3 pipeline/evaluate.py --pending           # every `uploaded` visit in Supabase → `analysed` / `failed`
python3 pipeline/transcribe.py data/recordings/B2_Akshay_2026-10-15_1014.mp4   # transcript + cues only
python3 pipeline/report.py --supabase --date 2026-10-17   # visits from Supabase → daily_reports (numbers, markdown, actions)
python3 pipeline/report.py --supabase --notify           # today; then the app emails the owner (needs APP_BASE_URL)
```

## On a schedule
`.github/workflows/pipeline.yml` runs `evaluate.py --pending` every 5 minutes and `report.py --supabase --notify` at 21:37 IST. Both can also be started by hand (Actions → pipeline → Run workflow). The app starts the pending job straight after an upload when `GITHUB_DISPATCH_TOKEN` and `GITHUB_PIPELINE_REPO` are set in Vercel; otherwise the next scheduled run picks the clip up. GitHub can delay scheduled runs by a few minutes when it's busy.

Repo secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, optional `ANTHROPIC_API_KEY`. Repo variables: `APP_BASE_URL` (the Vercel URL; without it the report is saved but not sent), optional `GEMINI_MODEL`.

## Daily report row
`report.py --supabase` upserts one `daily_reports` row per date with `store = 'ALL'`: `numbers` (the reference shape plus the visit ids behind each number), `markdown` (the one-page report) and `actions` (one line per section: `headline`, `lostSales`, `lostDemand`, `storePattern`, `salespeople`, `busiestHours`, `followUps`). A re-run updates the row in place and keeps its id, so the owner's "sent once" record in `ux_notifications` still points at it.

Keys go in `.env` at the repo root (git-ignored) or in the environment. Names: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Not done yet
- Where the transcript lives. It's saved next to the scorecard locally (`<id>.transcript.txt`, `<id>.cues.json`) but not in Supabase: `analysis` has no field for it and the bucket only takes media. The team needs to pick a column or table.
- `data/recordings/B2_Akshay_2026-10-15_1014.mp4` is a synthetic test clip: the B2-1014 transcript read by Gemini text-to-speech over a grey picture (so expect a "camera" flag and no face cues). Tested end to end: `evaluator/runs/2026-10-20-clip/`.
- The schedule hasn't run on GitHub yet: it needs the repo secrets above.
