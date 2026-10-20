# Pipeline (Stream 2)

```
transcript ──evaluate.py──▶ scorecard JSON ──(Supabase visits.analysis)──▶ report.py ──▶ daily report + owner WhatsApp
             (SOP = system prompt)          validate.py checks the SOP rules     (numbers by code, words by model)
```

| File | What it does |
|---|---|
| `llm.py` | One call surface for every model: Claude SDK (if `ANTHROPIC_API_KEY`), then the Claude Code CLI (no key needed in a Claude Code session), then Gemini (if `GEMINI_API_KEY`; model from `GEMINI_MODEL`, default `gemini-3.8-flash`, since Pro needs a billed key). The first one that works wins. |
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
```

Keys go in `.env` at the repo root (git-ignored) or in the environment. Names: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Not done yet
- `--supabase` is untested against the live project: this environment has no `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` yet (the host is reachable). The 6 test transcripts include two dated 2026-10-17 (B2-1018, B2-1019); writing them would add to that day's 102 seeded visits.
- Video and audio input. Gemini will take the clip directly, and its voice and face cues go in as `observations`.
- Sending the email (Resend) and the WhatsApp message (Ayse's `ux_notifications`).
