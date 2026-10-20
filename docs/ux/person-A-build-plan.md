# Person A (Ayse) build plan: upload flow and WhatsApp push

Give Claude Code this file **and** `docs/ux-plan.md` (the master plan). Read `docs/ux/README.md` first: it records decisions that override the master plan. This file decides who does what; the master plan decides how.

## What you own

| Phases | Folders and files you own |
|---|---|
| Phase 3 Upload flow | `app/(ux)/upload/**`, `app/api/ux/upload/**`, `app/api/ux/visits/[id]/route.ts` (status polling), `components/ux/upload/**`, `lib/storage/**` |
| Phase 5 WhatsApp push | `app/api/ux/notify/**`, `app/(ux)/dev/**` (the "Generate report" button), `lib/notify/**` |
| Accounts and env | Supabase keys (from Stream 2), Twilio account, `.env.local`, and your lines in `.env.example` |

**Do not edit** Person B's files: `lib/data/**`, `lib/types/**`, `app/(ux)/owner/**`, `app/(ux)/manager/**`, `app/(ux)/staff/**`, `app/(ux)/layout.tsx`, `components/ux/{report,visit,review,shared}/**`. If you need a new repo method or a field, ask Person B. Interface changes go in their own small PR.

## While Person B builds the foundation (first hour, no dependency on it)

1. **Twilio:** create the account, open the WhatsApp sandbox and join it from the owner's demo phone. Send "hi" so the 24-hour window is open.
2. **Supabase:** get the project URL and keys from the Stream 2 owner and put them in `.env.local`. Never commit `.env.local`.
3. Start branch `ux/upload-form` and build the form UI, which needs no data layer:
   - fields for store, salesperson and time
   - a file picker that accepts `video/*` and `audio/*`
   - client-side checks on type and size, and on duration (1 to 5 minutes, read from a hidden `<video>`/`<audio>` element's metadata)
4. Write `lib/notify/whatsapp.ts`: `sendReport(to, text)` wrapping Twilio. It has no data dependency.

When Person B says the foundation is on main, run `git merge origin/main` into your branch (see the git workflow).

## PR A1: `ux/upload-form` (Phase 3, part 1)

- The form from above. Fill the store and salesperson pickers from `visitRepo.list()` in the server component.
- Use Person B's shared `EmptyState`, `ErrorState` and `Spinner`.

## PR A2: `ux/upload-flow` (Phase 3, part 2)

- `lib/storage/`: a `ClipStore` interface.
  - Mock: writes to a local `.uploads/` folder. Add it to `.gitignore`.
  - Supabase: writes to the storage bucket. Leave it as a stub until the bucket exists.
  - Pick the implementation with `DATA_SOURCE`, the same way `lib/data` does.
- `POST /api/ux/upload` does three things in order: store the clip, call `visitRepo.create` (status `pending`), then call `analyseClient.analyse(id)`.
- `GET /api/ux/visits/[id]` returns the status for polling.
- The page shows `uploading → analysing → done`, then links to `/owner/visits/[id]`.
- On failure, show the error and a Retry button. A visit must never be stuck without a visible state.

**Done when:** a clip uploaded on `/upload` shows up on `/owner` with a canned scorecard. Check this on main after Person B's `ux/owner-visits` PR has merged.

## PR A3: `ux/whatsapp` (Phase 5)

- `lib/notify/format.ts`: a pure function that turns a report into summary text: top walkout reason, conversion rate, top action, and the link `/owner/reports/[date]`. Unit-test it against the reference report.
- `ux_notifications` with columns `report_id` (unique), `channel`, `status`, `sent_at`, `error`:
  - Mock: an in-memory `Map` keyed by `report_id`, kept on `globalThis`.
  - Real: a migration file. Ask the Stream 2 owner where migrations live. Don't touch their tables.
- `POST /api/ux/notify { reportId }`:
  1. Insert the notification row first. If the row already exists, return without sending.
  2. Send the message.
  3. Update the row's status.
  4. Log every attempt.
  5. If WhatsApp fails, log it and return 200. Stream 2's email still goes out.
- `NOTIFY_TRIGGER=report_ready|visit_done` from env.
- `/dev`: a "Generate report" button that calls the notify route.
- **The link must be public.** Twilio delivers the message to a real phone, so `localhost` won't open there. Use the deployed URL (for example Vercel) or an ngrok tunnel, and set `APP_BASE_URL` in env.

**Done when:** one click delivers a WhatsApp message with a working link, and a second click sends nothing.

## Later: plug-in to Stream 2

You own steps 5 and 6 of the master plan's plug-in checklist:
- point the Supabase report-insert webhook at the deployed `/api/ux/notify`
- run the `ux_notifications` migration
- wire `AnalyseClient` to Stream 1

Person B does the repo mapping. See `docs/ux/git-workflow.md`.
