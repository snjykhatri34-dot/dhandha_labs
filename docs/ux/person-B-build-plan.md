# Person B build plan: platform base, owner view, manager review

Give Claude Code this file **and** `docs/ux-plan.md` (the master plan). This file decides who does what; the master plan decides how.

## What you own

You build the base that Person A plugs into, then everything the owner and manager see.

| Phases | Folders and files you own |
|---|---|
| Phase 1 Foundation (you drive) | `lib/types/**`, `lib/data/**` (types, mock, supabase, index) |
| Phase 2 Owner view | `app/(ux)/owner/**`, `components/ux/report/**`, `components/ux/visit/**` |
| Phase 4 Manager review | `app/(ux)/manager/**`, `app/(ux)/staff/**`, `components/ux/review/**` |
| Phase 6 Polish, reference test | `app/(ux)/layout.tsx`, `components/ux/shared/**`, `tests/ux/**` |
| Plug-in to Stream 2 (later) | `lib/data/supabase/**` |

**Do not edit** Person A's files: `app/(ux)/upload/**`, `app/(ux)/dev/**`, `app/api/ux/**`, `components/ux/upload/**`, `lib/notify/**`, `lib/storage/**`. If you need a change there, ask Person A.

## Step 0: before any code (about 20 minutes)

1. Wait until the Stream 2 owner has created the repo and added you both as collaborators.
2. Clone it and read `schemas.md`, the sample day (102 visits), the reference report, the six scripted conversations and the ERP export.
3. Put any schema gaps in `docs/ux-schema-questions.md`. Two gaps you will probably hit:
   - **Visit processing status** (`pending`, `analysing`, `done`, `failed`). If `schemas.md` doesn't define it, ask Stream 2 whether it will be a column on `visits`.
   - **Review status** (`approved`, `rejected`, reviewer). We can't add columns to shared tables, so plan for our own table, `ux_visit_reviews (visit_id, status, reviewed_by, reviewed_at)`. In mock mode, keep it in memory.

## PR 1: `ux/foundation` (Phase 1). Merge this first because it unblocks Person A.

Aim to merge within about an hour. Person A can't build the real upload flow until it lands.

- Set up Next.js App Router, TypeScript and Tailwind to match the shared repo. Don't reorganise anything Stream 2 set up.
- `lib/types/scorecard.ts`: generate it from `schemas.md`. Never invent fields.
- `lib/data/types.ts`: define all three interfaces in full, **including the methods Person A needs** (`VisitRepo.create`, `AnalyseClient.analyse`) and the ones Phase 4 needs (`VisitRepo.setReview`). Put fields that are UX-only (processing status, review status) in a wrapper type here, not in `scorecard.ts`.
- `lib/data/mock/`:
  - Load the sample day and the reference report. If Stream 2 already committed them, read them from where they are. Otherwise put them in `lib/data/mock/fixtures/`.
  - Keep the in-memory store on `globalThis`. Otherwise, in dev mode, a visit uploaded on one page disappears on another.
  - `analyse()` waits 3 seconds, then sets the visit to `done` with a canned scorecard from a scripted conversation.
- `lib/data/supabase/`: stubs that throw `NotImplemented`.
- `lib/data/index.ts`: picks the implementation from `DATA_SOURCE=mock|supabase`. The default is `mock`.
- `app/(ux)/layout.tsx`: navigation (Upload, Owner, Manager, Staff) and a simple role switch (owner, manager, staff) stored in a cookie. No real auth.
- `components/ux/shared/`: `Badge`, `StatusPill`, `EmptyState`, `ErrorState`, `Spinner`. Person A reuses these.
- `.env.example`: `DATA_SOURCE=mock`, `NOTIFY_TRIGGER=report_ready`, and empty placeholders for the Supabase and Twilio keys.
- `package.json` scripts: `lint`, `typecheck`, `test` (Vitest).
- A throwaway page at `/ux-debug` that lists all 102 visits.

**Done when:** `/ux-debug` shows 102 visits, and lint, typecheck and tests all pass. Merge, then message Person A: "foundation is on main, pull it."

**Interface freeze:** after PR 1, any change to `lib/data/types.ts` or `lib/types/**` goes in its own small PR. Tell Person A before you merge it.

## PR 2: `ux/owner-report` (Phase 2, part 1)

- `/owner` shows the latest report at the top.
- `/owner/reports/[date]` uses the same report component. Ship this route early, because Person A's WhatsApp link points to it.
- Report sections: by reason, store, salesperson and hour. **Each section ends with its action line.**
- Turn a `DailyReport` into display data with a pure function, `toReportView(report)`. Components take props only; they never fetch data.
- `tests/ux/report.reference.test.ts`: assert that every number from `toReportView(mockReport)` equals the reference file exactly.

**Done when:** the reference test passes.

## PR 3: `ux/owner-visits` (Phase 2, part 2)

- The visit list sits below the report on `/owner`, with filters for store, salesperson and outcome. Keep the filters in URL search params.
- `/owner/visits/[id]` shows:
  - outcome and why
  - objections with timestamps
  - customer emotion with its cue (words, voice or face)
  - handling score (x/5)
  - coaching line
  - lost demand
- The page must also handle a visit in `pending` or `analysing` state, because Person A's upload links here right after upload.

## PR 4: `ux/manager-review` (Phase 4)

- `/manager/review`: a queue of unreviewed scorecards with Approve and Reject buttons. They are server actions that call `visitRepo.setReview`.
- `/staff`: shows approved scorecards only.
- Owner pages show every scorecard and put a "Pending review" badge on unapproved ones.
- Put this copy on the page: "Scorecards are never the sole basis for pay."

**Done when:** an unapproved scorecard is hidden on `/staff` and visible, with a badge, on `/owner`.

## PR 5: `ux/polish` (Phase 6). Start after Person A's upload PRs are merged.

- Make the owner view mobile-first. Test it at 375px wide.
- Add `loading.tsx` and `error.tsx` to every route you own. Person A handles the states on their own pages using your shared components.
- Do one end-to-end pass of the demo path: upload → scorecard → report → WhatsApp. If something on Person A's pages needs fixing, tell them rather than editing their files.

## Later: plug-in to Stream 2

You lead steps 1 to 4 of the master plan's plug-in checklist. `docs/ux/git-workflow.md` covers the branch and the order of merges.
