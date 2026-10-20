# Pipeline (Stream 2)

```
transcript ──evaluate.py──▶ scorecard JSON ──(Supabase visits.analysis)──▶ report.py ──▶ daily report + owner WhatsApp
             (SOP = system prompt)          validate.py checks the SOP rules     (numbers by code, words by model)
```

| File | What it does |
|---|---|
| `llm.py` | One call surface for every model: Claude SDK (if `ANTHROPIC_API_KEY`), then the Claude Code CLI (no key needed in a Claude Code session), then Gemini (if `GEMINI_API_KEY`). The first one that works wins. |
| `evaluate.py` | Runs `evaluator/SOP.md` on every transcript in `data/transcripts/`, validates each scorecard, compares the key fields with `expected_outputs/visits/`, and writes `evaluator/runs/<date>/`. |
| `validate.py` | The SOP's hard rules as code: fixed lists, exact quotes, real timestamps, arc = first→last emotion, lost_demand ⇔ reason, and every stock gap left unresolved has a matching missed opportunity. |
| `report.py` | Computes the day's numbers (checked against `daily_report_reference.json`), checks stock in `data/mock_erp/`, drafts a transfer, then has the model write the one-page report and the owner WhatsApp. Writes `reports/<date>/`. |

## Run

```bash
pip install anthropic                     # only needed for the API-key path
python3 pipeline/evaluate.py              # scorecards for all transcripts
python3 pipeline/report.py --scorecards evaluator/runs/2026-10-20-v4
python3 pipeline/evaluate.py --provider gemini   # force a provider
```

Keys go in `.env` at the repo root (git-ignored) or in the environment. Names: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Not done yet
- Writing scorecards to Supabase from the script. That needs `SUPABASE_SERVICE_ROLE_KEY` and network access to `*.supabase.co`. For now rows go in through the Supabase connector.
- Video and audio input. Gemini will take the clip directly, and its voice and face cues go in as `observations`.
- Sending the email (Resend) and the WhatsApp message (Ayse's `ux_notifications`).
