# Pipeline (Stream 2)

```
clip (Supabase `recordings`) ──transcribe.py (Gemini: words, role + tone per turn, voice/face cues)──▶ transcript + observations
                                                       └──▶ Supabase visit_transcripts
transcript ──evaluate.py──▶ scorecard JSON ──(Supabase visits.analysis)──▶ report.py ──▶ daily report + owner WhatsApp
             (SOP = system prompt)  │        validate.py checks the SOP rules     (numbers by code, words by model)
                                    └──message.py──▶ per-visit owner WhatsApp ──▶ Supabase visit_messages
```

A transcript line for people reads `[00:22] Customer: (Taken aback, overwhelmed, and firm in rejection) That's far too heavy.`
The SOP still gets `[mm:ss] Speaker X: text` plus `observations`, so the tone labels don't change its evidence rules.

| File | What it does |
|---|---|
| `llm.py` | One call surface for every model: Claude SDK (if `ANTHROPIC_API_KEY`), then the Claude Code CLI (no key needed in a Claude Code session), then Gemini (if `GEMINI_API_KEY`; model from `GEMINI_MODEL`, default `gemini-3.8-flash`, since Pro needs a billed key). The first one that works wins. |
| `transcribe.py` | Step 1: sends a video/audio clip to Gemini with `evaluator/TRANSCRIBE.md` and returns `[mm:ss] Speaker X:` lines plus voice/face `observations` (the SOP's input), and each turn's `role` and three-word `tone` with a readable `[mm:ss] Salesperson: (tone) text` version. Clips up to 70 MB go inline; bigger ones through the Gemini Files API. |
| `evaluate.py` | Runs `evaluator/SOP.md` on every transcript in `data/transcripts/`, validates each scorecard, compares the key fields with `expected_outputs/visits/`, and writes `evaluator/runs/<date>/` (scorecard, transcripts, cues and `<id>.message.txt`). `--pending` does it all from and to Supabase. |
| `message.py` | Step 3: one scorecard → the owner's WhatsApp text for that visit, by code (no model call): outcome, ask, why, objections and stock gaps with timestamps, arc, score, coaching tip. Adds a link to `/owner/visits/<id>` when `APP_BASE_URL` is set. Writes text only; sending is the UX layer's. |
| `store.py` | Supabase over REST with the service role key: upserts scorecards into `visits`, transcripts into `visit_transcripts`, messages into `visit_messages`; downloads and uploads clips in `recordings`. |
| `upload.py` | Puts a local clip into `recordings` and creates its `uploaded` visit with the web app's rules: bucket path with an upload stamp (`lib/storage/path.ts`) and the next visit id (`nextVisitId`). `--visit-no` picks the id instead; an existing id is refused unless `--replace`. |
| `run_clip.py` | One clip, start to finish: upload (for a local file) or `--visit <id>` (already in Supabase), then everything `--pending` does for that visit, and prints the transcript, scorecard and message. The `evaluate-clip` skill (`.claude/skills/`) runs it. |
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
python3 pipeline/transcribe.py data/recordings/B2_Akshay_2026-10-15_1014.mp4   # readable transcript + cues only
python3 pipeline/message.py evaluator/runs/2026-10-20-clip/B2-1014.json         # owner message for one scorecard

# One clip, all through Supabase:
python3 pipeline/run_clip.py clip.mp4 --store B2 --salesperson Akshay --at "2026-10-20 10:44"
python3 pipeline/run_clip.py --visit B2-1020     # clip already in the bucket
```

`--pending` for each `uploaded` visit: download the clip from `recordings` → transcribe → save to `visit_transcripts`
(before scoring, so a scoring error doesn't lose it) → score → `visits.analysis` + status → if `analysed`, build the
owner message and save it to `visit_messages`. A visit set to `failed` gets no message; a manager checks it first.

Keys go in `.env` at the repo root (git-ignored) or in the environment. Names: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_BASE_URL` (optional, for the link in the message).

## Not done yet
- `--supabase` is untested against the live project: this environment has no `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` yet (the host is reachable). The 6 test transcripts include two dated 2026-10-17 (B2-1018, B2-1019); writing them would add to that day's 102 seeded visits.
- Something to start `--pending` after each upload (a schedule or a webhook). It runs by hand for now.
- `--pending`, `upload.py` and the new tables are untested against the live project for the same reason (no service role key here). The requests were checked against a local stand-in server, and the tables are created on the live project.
- `data/recordings/B2_Akshay_2026-10-15_1014.mp4` is a synthetic test clip: the B2-1014 transcript read by Gemini text-to-speech over a grey picture (so expect a "camera" flag and no face cues). Tested end to end: `evaluator/runs/2026-10-20-clip/`. A real phone recording of the same script went through `--clips` (`gemini-3.6-flash` + Claude): every turn got a role and tone, rules clean, and outcome, reason and score match the B2-1014 label.
- Sending the email (Resend) and the WhatsApp messages: the daily one (Ayse's `ux_notifications`) and the per-visit ones waiting in `visit_messages` (`sent_at` is null until sent).
