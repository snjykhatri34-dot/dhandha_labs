---
name: evaluate-clip
description: Evaluate one counter clip end to end and update Supabase. The clip is either a file shared in chat (uploaded to the `recordings` bucket first) or a visit already in Supabase. Gemini transcribes it (each line with speaker role and tone), the SOP scores it, and the transcript, scorecard and owner WhatsApp message are written to Supabase and shown in chat. Use when someone shares a counter video or audio, or names a visit id, and asks to evaluate, analyse, score or process it, or to run it through the pipeline or Supabase.
---

# Evaluate a counter clip

One command does the whole flow: `pipeline/run_clip.py`. The clip comes from one of two places:

| Source | When | Command |
|---|---|---|
| **A file here** | The user shared a video or audio in chat, or gave a local path | `run_clip.py <clip> --store … --salesperson … --at …`: uploads it first |
| **Supabase** | The clip is already in the `recordings` bucket (the upload page put it there) and the user gives a visit id | `run_clip.py --visit B2-1020`: no upload |

```
[file here ─▶ recordings bucket + visits row (uploaded)]      ← skipped with --visit
clip in Supabase ─▶ downloaded ─▶ Gemini transcript (role + tone per line) ─▶ visit_transcripts
                 ─▶ SOP scorecard + rule check ─▶ visits.analysis, status analysed | failed
                 ─▶ owner WhatsApp text (analysed only) ─▶ visit_messages
```

Either way the clip is read **from Supabase**, so a local file takes the same path an uploaded one will.

To find clips waiting in Supabase (Supabase MCP):
`select id, store, salesperson, recorded_at, media_path from visits where status = 'uploaded' and media_path is not null order by created_at`.
With `--visit`, the store, salesperson and time come from the visit row; don't ask for them.

## 1. Gather the inputs (file here only)

| Input | Flag | Where it comes from |
|---|---|---|
| Clip path | positional | The file the user shared (MP4, MOV, M4A, MP3, WEBM; up to 5 minutes) |
| Store | `--store` | `B1`, `B2` or `B3` |
| Salesperson | `--salesperson` | First name, as in `visits` (Akshay, Priya, Rohit, Harish, …) |
| Visit time | `--at` | Shop time (Asia/Kolkata), `"YYYY-MM-DD HH:MM"` or with `:SS` |
| Visit number | `--visit-no` (optional) | Only if the user names one; otherwise the web app's next id |

Never invent the store, salesperson or time (CLAUDE.md: never invent facts). Ask for whatever the user didn't
give, in one question. A WhatsApp file name like `WhatsApp Video 2026-10-20 at 10.44.33` gives a likely date and
time: offer it, don't assume it.

The upload follows the web app's rules (`pipeline/upload.py` explains them): the bucket path carries an upload
stamp, and the visit id is one above the highest number in any store (`B2-1103`). With `--visit-no` the script
refuses an id that already exists. Pass `--replace` only when the user says to redo that visit, because it
overwrites its analysis.

To upload without evaluating (for example, test clips for the web app), run `python3 pipeline/upload.py` with the
same flags, one clip at a time, in time order.

## 2. Check before running

- `.env` at the repo root (or the environment) needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
  `GEMINI_API_KEY`. Check that they're set without printing their values. If one is missing, say which and stop.
- The scoring step uses Claude (API key or the `claude` CLI), then falls back to Gemini.

## 3. Run

```bash
python3 pipeline/run_clip.py "<clip>" --store B2 --salesperson Akshay --at "2026-10-20 10:44"   # file here
python3 pipeline/run_clip.py --visit B2-1103                                                    # already in Supabase
```

`--visit` re-scores a visit even if it's already `analysed`, and overwrites its transcript, scorecard and
message. If the row's status isn't `uploaded`, check with the user first. Allow up to 10 minutes. If Gemini answers `429` with a daily quota (free tier: 20 requests a day per model),
rerun with another Flash model from the same key: `GEMINI_MODEL=gemini-3.6-flash python3 pipeline/run_clip.py ...`.
For a file, the upload already happened, so rerun with `--visit <id>` and don't upload again. Tell the user which model you used.

## 4. Report in chat, in this order

1. **The transcript**, every line with its tone, exactly as the script printed it:
   `[00:22] Customer: (Taken aback, overwhelmed, and firm in rejection) That's far too heavy!`
2. **The scorecard**: outcome, reason, handling score, emotion arc, and every flag. Cite visit id and timestamp
   for claims (`B2-1020 @00:44`).
3. **The owner message**, as printed.
4. **Supabase**: the visit id, its status, and the three places written (`visits`, `visit_transcripts`,
   `visit_messages`). If the Supabase MCP is available, confirm with
   `select id, status from visits where id = '<id>'` and a count from the two other tables.

If the visit ended `failed`, show the rule problems and say a manager must review it. No message is created
for it. Don't rerun to make the problems go away.

## Rules

- Nothing is sent to anyone. The message is saved for the owner; sending is the UX layer's job.
- Don't commit the clip to git. Clips stay in Supabase Storage. Local outputs land in
  `evaluator/runs/<date>/`; commit those only if the user asks.
- Don't edit `evaluator/SOP.md` or `evaluator/TRANSCRIBE.md` to change one visit's result.
