# Counter Intelligence: UX Layer Build Plan

Paste this into Claude Code as the first prompt, or save it as `docs/ux-plan.md` and reference it.

## 0. Your job (read first)

You are building the **UX layer** for Counter Intelligence, an AI analyst for jewelry stores. Two people are building it. A third teammate owns Stream 2 (Supabase schema, `visits` table, daily report generation, Resend email) and is setting up the shared repo and Supabase project.

The UX layer has three parts:
1. **Upload**: a screen where staff upload a counter clip with store, salesperson and time.
2. **Owner view**: a dashboard where the owner reads the daily report and individual visit scorecards.
3. **WhatsApp push**: when a report is ready, it is sent to the owner's WhatsApp automatically.

**Hard requirement:** build everything against a **mock data layer** now, so that once Stream 2 is done we swap one environment variable and it works on real data. No UI component may import Supabase directly.

## 1. Before writing any code

1. Open the project zip (`counter-intelligence.zip`) and summarise it. Locate and read:
   - `schemas.md`: the shared scorecard format. **Do not change it.** If something is missing, write it down in `docs/ux-schema-questions.md` and ask the Stream 2 owner.
   - The sample day of 102 analysed visits (our mock data).
   - The reference file for the daily report (our test oracle).
   - The six scripted conversations with hand labels.
   - The mock ERP stock export.
2. Generate TypeScript types from `schemas.md` into `lib/types/scorecard.ts`. Everything else imports from there.
3. Check the shared repo's structure and conventions. Match them. Do not reorganise anything.

## 2. Ownership and boundaries

| Area | Owner | UX layer may |
|---|---|---|
| Gemini call, skill file | Stream 1 | Call it through the `AnalyseClient` interface only |
| `visits` table, report builder, Resend email | Stream 2 | Read via the `VisitRepo` and `ReportRepo` interfaces only |
| MCP server, ERP tools | Stream 3 | Not touched |
| Web app, upload, owner view, WhatsApp | **Us** | Full ownership |

Rules:
- Work on branch `ux/*`. Small PRs. Never push to `main` directly.
- Only edit files in our folders (section 3). If a change is needed elsewhere, leave a note for the owner instead of making it.
- Never add or alter columns in shared tables. Our own tables (e.g. `notifications`) are prefixed `ux_`.
- Synthetic data only. No real customer data anywhere.

## 3. Folder layout (ours only)

```
app/(ux)/
  upload/page.tsx
  owner/page.tsx                    # today's report + visit list
  owner/reports/[date]/page.tsx
  owner/visits/[id]/page.tsx
  manager/review/page.tsx           # approve scorecards before staff see them
app/api/ux/
  upload/route.ts
  notify/route.ts                   # WhatsApp send trigger
components/ux/                      # all UI components
lib/data/
  types.ts                          # VisitRepo, ReportRepo, AnalyseClient interfaces
  mock/                             # reads sample-day JSON, in memory
  supabase/                         # real implementations (stubs until Stream 2 is done)
  index.ts                          # picks implementation from DATA_SOURCE
lib/notify/
  whatsapp.ts                       # Twilio sender
  format.ts                         # report to WhatsApp summary text
lib/types/scorecard.ts              # generated from schemas.md
docs/ux-plan.md
```

## 4. The data layer (what makes plug-in trivial)

Define interfaces in `lib/data/types.ts`:

```ts
interface VisitRepo {
  list(filter: { date?: string; store?: string; salesperson?: string; outcome?: string }): Promise<Visit[]>;
  get(id: string): Promise<Visit | null>;
  create(input: NewVisit): Promise<Visit>;               // upload creates a pending visit
  setReview(id: string, status: 'approved' | 'rejected', by: string): Promise<void>;
}
interface ReportRepo {
  getByDate(date: string): Promise<DailyReport | null>;
  latest(): Promise<DailyReport | null>;
}
interface AnalyseClient {
  analyse(visitId: string): Promise<void>;               // triggers Stream 1; result lands in visits
}
```

- `lib/data/mock/` implements all three from the sample-day JSON and the reference report. `AnalyseClient` mock waits 3 seconds, then flips the visit from `pending` to `done` with a canned scorecard from one of the scripted conversations.
- `lib/data/supabase/` implements the same interfaces. Leave as stubs that throw `NotImplemented` until Stream 2 ships the table.
- `lib/data/index.ts` exports the right implementation based on `DATA_SOURCE=mock|supabase`. Default `mock`.
- Components and pages call only `lib/data`.

## 5. Build phases

Each phase ends with something demoable. Commit at the end of each.

### Phase 1: Skeleton and mock data (1 person, ~30 min)
- Next.js (App Router) + TypeScript + Tailwind, matching the shared repo's setup.
- Types, interfaces, mock implementation, `DATA_SOURCE` switch.
- **Done when:** a throwaway page lists all 102 sample visits from the mock repo.

### Phase 2: Owner view (person B)
- `/owner`: today's report at the top, visit list below, filters for store, salesperson, outcome.
- Report sections: by reason, store, salesperson, hour. **Each section ends with its action line**, as the brief requires.
- `/owner/visits/[id]`: outcome, why, objections with timestamps, customer emotion **with its cue** (words, voice or face), handling score (x/5), coaching line, lost demand.
- **Done when:** the numbers shown on the report page match the reference file exactly. Write a test that compares them.

### Phase 3: Upload flow (person A, in parallel with Phase 2)
- `/upload`: fields for store, salesperson, time; file picker for video or audio, 1 to 5 minutes. Validate type and size client-side.
- Upload to the Supabase storage bucket (use the mock/local path while the bucket isn't ready, behind the same interface).
- Create a `pending` visit, call `AnalyseClient.analyse`, show status `uploading → analysing → done`, then link to the visit page.
- Handle failure: show the error and a retry button. Never leave a visit stuck without a visible state.
- **Done when:** a clip uploaded on the page appears in the owner view with a scorecard (canned in mock mode).

### Phase 4: Manager review
- `/manager/review`: queue of unreviewed scorecards. Approve or reject.
- Staff-facing views show only approved scorecards. Owner sees all, with a clear "pending review" badge.
- Copy on the page: scorecards are never the sole basis for pay.
- **Done when:** an unapproved scorecard is hidden from the staff view and visible, badged, to the owner.

### Phase 5: WhatsApp push
- `POST /api/ux/notify` takes `{ reportId }`, builds a short summary (top reason for walkouts, conversion, top action) plus a link to `/owner/reports/[date]`, and sends via **Twilio WhatsApp**.
- `lib/notify/whatsapp.ts` wraps Twilio behind `sendReport(to, text)`. The sender is swappable.
- Table `ux_notifications` (`report_id` unique, `channel`, `status`, `sent_at`, `error`). Insert first, send second, so **one report never sends twice**. Log every attempt.
- **Trigger options (make it configurable by env, `NOTIFY_TRIGGER=report_ready|visit_done`):**
  - In mock mode: a "Generate report" dev button calls `/api/ux/notify`.
  - After Stream 2 ships: a Supabase database webhook on report insert calls `/api/ux/notify`.
- **Twilio setup now:** create the account, join the WhatsApp sandbox from the owner's demo phone. Messages outside the 24-hour window need an approved template, so for the demo keep the recipient inside the window (send a "hi" to the sandbox first).
- Fallback: if WhatsApp fails, log it and let Stream 2's Resend email stand. Do not fail the report.
- **Done when:** clicking the dev button delivers a WhatsApp message with a working link, and clicking it twice sends only one.

### Phase 6: Polish
- Mobile-first layout for the owner view (the owner reads this on a phone).
- Empty, loading and error states on every page.
- Make the demo path obvious: upload → scorecard → report → WhatsApp.

## 6. Plug-in checklist (when Stream 2 is done)

1. Pull latest `main`. Read the final `visits` columns and the report table or shape.
2. Diff them against `lib/types/scorecard.ts`. Fix mismatches in the **mapping layer inside `lib/data/supabase/`**, not in components.
3. Implement `VisitRepo` and `ReportRepo` in `lib/data/supabase/`.
4. Set `DATA_SOURCE=supabase`. Run the Phase 2 reference-file test against real data.
5. Point the `ux_notifications` trigger at the real report-insert webhook.
6. Wire `AnalyseClient` to Stream 1's real endpoint or function.
7. Run the full demo path end to end with a new clip.

## 7. Task split for two people

| Person A | Person B |
|---|---|
| Phase 3 Upload flow | Phase 2 Owner view |
| Phase 5 WhatsApp push | Phase 4 Manager review |
| Supabase and Twilio accounts and env | Phase 6 Polish, reference-file test |

Phase 1 is done together by whoever drives first; the less experienced builder drives.

## 8. Rules for Claude Code

- Read `schemas.md` before writing any type. Never invent fields.
- Ask before changing anything outside our folders.
- Keep components dumb: data in via props, data access only in server code through `lib/data`.
- Every number on screen must trace to a visit or report row. No hard-coded demo numbers outside the mock data.
- Secrets (Twilio, Supabase keys) go in `.env.local` only. Never commit them. Provide `.env.example`.
- After each phase, run lint, typecheck and tests, then summarise what changed.

## 9. Open questions to settle with the team

- Video or audio-only for the demo? (Affects upload size limits and the file picker.)
- Report at closing, or an update after every visit? (Drives `NOTIFY_TRIGGER`.)
- Where does Stream 2 want the "report ready" signal: a row insert, or a function call?
- Who approves in the manager review step in the demo, and with what login? (Keep it a simple role switch, no real auth.)
