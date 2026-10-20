# Git workflow: UX team (A and B) and the Stream 2 hand-off

## The model in one paragraph

There is **one shared repo and one `main`**. Everyone, both of us and Stream 2, merges small PRs into `main`. We don't keep a separate "UX platform" branch that gets merged at the end. That works for three reasons:
- each person edits only their own folders, so PRs rarely conflict
- our code runs on mock data by default, so it's harmless on `main` before Stream 2 is done
- "plugging in" Stream 2 is a small PR plus flipping `DATA_SOURCE=supabase`, not a big merge

## One-time setup

1. Sanjay (Stream 2 owner) creates the GitHub repo, adds A and B as collaborators, and protects `main`: Settings → Branches → require a pull request before merging.
2. Each of us runs:

```bash
git clone <repo-url>
```

```bash
npm install
```

```bash
cp .env.example .env.local
```

## The daily loop (same for A and B)

Start a branch from an up-to-date `main`:

```bash
git checkout main
```

```bash
git pull
```

```bash
git checkout -b ux/owner-report
```

Work, then commit often:

```bash
git add -A
```

```bash
git commit -m "Owner report sections with action lines"
```

Before you push, pull in everyone else's merged work and re-run checks:

```bash
git fetch origin
```

```bash
git merge origin/main
```

```bash
npm run lint && npm run typecheck && npm test
```

Push and open the PR:

```bash
git push -u origin ux/owner-report
```

```bash
gh pr create --base main --fill
```

The other UX person reviews it. A quick look is fine. Merge it with **Squash and merge**, then delete the branch.

## Merge order (the order matters)

| # | Who | Branch | Merge when |
|---|---|---|---|
| 1 | B | `ux/foundation` | First. Everything else builds on it. |
| 2 | A | `ux/upload-form` | Any time after 1 (merge `origin/main` in first) |
| 3 | B | `ux/owner-report` | After 1 |
| 4 | B | `ux/owner-visits` | After 3 |
| 5 | A | `ux/upload-flow` | After 4 is merged, so the "appears in owner view" check works |
| 6 | B | `ux/manager-review` | After 4 |
| 7 | A | `ux/whatsapp` | After 3 (its link targets `/owner/reports/[date]`) |
| 8 | B | `ux/polish` | Last of the UX work |

Person A can start their branch before #1 lands. When #1 merges, they run `git merge origin/main` on their branch.

## Where conflicts can still happen, and how to handle them

| File | Rule |
|---|---|
| `lib/data/types.ts`, `lib/types/**` | Person B only. Changes go in a tiny standalone PR, announced in chat. |
| `package.json`, `package-lock.json` | If both of you added packages: keep both sides in `package.json`, delete the conflicted lockfile, run `npm install`, and commit the new lockfile. |
| `.env.example` | Keep both sides' lines. |
| `.gitignore` | Keep both sides' lines. |
| `app/(ux)/layout.tsx` (navigation) | Person B only. Person A asks for a new link. |

If you hit a conflict, open the file, keep the right lines, and delete the `<<<<<<<`, `=======` and `>>>>>>>` markers. Then:

```bash
git add -A
```

```bash
git commit
```

You can also ask Claude Code to "resolve the merge conflicts, keeping both sides' changes."

## Stream 2: working alongside us

- Stream 2 works on `s2/*` branches, in their own folders: schema and migrations, the `visits` table, the report builder, Resend. They PR to the same `main`.
- They **never edit** `app/(ux)`, `components/ux`, `lib/data`, `lib/notify` or `lib/storage`. We never edit their tables or folders.
- Their PRs and ours can land in any order, because our code doesn't import Supabase until the plug-in PR.

## Stream 2: the hand-off when they're done

**1. Stream 2 merges their final PR to `main`** and writes `docs/stream2-handoff.md` with:
- the final `visits` columns, and the report table or JSON shape
- how "report ready" is signalled (row insert or function call)
- the storage bucket name and access rules
- the env var names and where the keys live
- confirmation that our tables `ux_visit_reviews` and `ux_notifications` can go in their migrations folder

**2. Person B opens the plug-in branch** from a fresh `main`:

```bash
git checkout main
```

```bash
git pull
```

```bash
git checkout -b ux/supabase-plugin
```

On that branch, Person B:
- implements `VisitRepo` and `ReportRepo` in `lib/data/supabase/`
- fixes every column or shape mismatch in a mapping file **inside `lib/data/supabase/`**, never in components
- implements the Supabase `ClipStore` in coordination with Person A, or Person A pushes that piece to the same branch
- adds the `ux_` migrations

**3. Test locally against real data:** set `DATA_SOURCE=supabase` in `.env.local`, run the reference-file test, then run the demo path with a new clip.

**4. Stream 2 reviews the plug-in PR.** They know their tables best. Then merge it.

**5. Person A wires the triggers** (no code merge needed):
- In Supabase → Database → Webhooks, on report insert, call `https://<deployed-app>/api/ux/notify`. The app must be deployed: a webhook can't reach localhost.
- Wire `AnalyseClient` to Stream 1's endpoint (a small `ux/analyse-wiring` PR).

**6. Flip the switch in the deployed environment:** set `DATA_SOURCE=supabase` in the hosting settings (for example Vercel → Environment Variables), then redeploy.

**Rollback:** set `DATA_SOURCE=mock` and redeploy. No code changes.

**If Stream 2 changes their schema later,** only the mapping in `lib/data/supabase/` changes. That's a one-file PR.
