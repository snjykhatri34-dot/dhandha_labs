// Real implementation against Stream 2's Supabase tables (supabase/migrations/20261020160000_init.sql).
// Row shapes are mapped to UX types in ./mapping.ts.
import "server-only";

import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { buildDailyReport } from "@/lib/data/report";
import type { DailyReport, DataLayer, Visit } from "@/lib/data/types";
import { byNewest, matchesFilter, nextVisitId } from "@/lib/data/visit-list";
import { rowToVisit, savedReport, type DailyReportDbRow, type ReviewDbRow, type VisitDbRow } from "./mapping";
import { eq, rest } from "./rest";

async function loadVisits(): Promise<Visit[]> {
  // The whole table is small (one row per counter visit), so filter in memory with the same
  // rules as the mock. Move filters into the query if it grows past a few thousand rows.
  const [rows, reviews] = await Promise.all([
    rest<VisitDbRow[]>("visits?select=*"),
    rest<ReviewDbRow[]>("ux_visit_reviews?select=*"),
  ]);
  const byVisit = new Map(reviews.map((r) => [r.visit_id, r]));
  return rows.map((row) => rowToVisit(row, byVisit.get(row.id)));
}

async function reportRow(date: string): Promise<DailyReportDbRow | null> {
  const rows = await rest<DailyReportDbRow[]>(`daily_reports?select=*&report_date=${eq(date)}&store=eq.ALL&limit=1`);
  return rows[0] ?? null;
}

/**
 * Stream 2's saved report for the date if there is one (its numbers and actions win), else a report computed
 * from that day's analysed visits so the owner view still works. `source` says which.
 */
async function reportFor(date: string, all: Visit[]): Promise<DailyReport | null> {
  const dayVisits = all.filter((v) => v.date === date && v.status === "analysed");
  const row = await reportRow(date);
  if (!row && dayVisits.length === 0) return null;
  const computed = buildDailyReport(date, dayVisits, row?.created_at ?? new Date().toISOString());
  if (!row) return computed;
  return savedReport(computed, row);
}

async function reportDates(all: Visit[]): Promise<string[]> {
  const saved = await rest<{ report_date: string }[]>("daily_reports?select=report_date&store=eq.ALL");
  const fromVisits = all.filter((v) => v.status === "analysed").map((v) => v.date);
  return [...new Set([...saved.map((r) => r.report_date), ...fromVisits])].sort().reverse();
}

export const supabaseDataLayer: DataLayer = {
  visits: {
    async list(filter = {}) {
      return (await loadVisits()).filter((v) => matchesFilter(v, filter)).sort(byNewest);
    },
    async get(id) {
      const [rows, reviews] = await Promise.all([
        rest<VisitDbRow[]>(`visits?select=*&id=${eq(id)}&limit=1`),
        rest<ReviewDbRow[]>(`ux_visit_reviews?select=*&visit_id=${eq(id)}&limit=1`),
      ]);
      return rows[0] ? rowToVisit(rows[0], reviews[0]) : null;
    },
    async create(input) {
      // Open question for Stream 2 (docs/ux-schema-questions.md #7): who mints ids. Until then
      // the UX takes the next number, the same rule as the mock and the sample data.
      const ids = await rest<{ id: string }[]>("visits?select=id");
      const [row] = await rest<VisitDbRow[]>("visits", {
        method: "POST",
        prefer: "return=representation",
        body: JSON.stringify({
          id: nextVisitId(input.store, ids.map((r) => r.id)),
          store: input.store,
          salesperson: input.salesperson,
          recorded_at: input.recordedAt,
          media_path: input.mediaPath,
          status: "uploaded",
          analysis: null,
        }),
      });
      return rowToVisit(row);
    },
    async setReview(id, status, by) {
      await rest("ux_visit_reviews?on_conflict=visit_id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: JSON.stringify({ visit_id: id, status, reviewed_by: by, reviewed_at: new Date().toISOString() }),
      });
    },
  },
  reports: {
    async getByDate(date) {
      return reportFor(date, await loadVisits());
    },
    async latest() {
      const all = await loadVisits();
      const [date] = await reportDates(all);
      return date ? reportFor(date, all) : null;
    },
    async dates() {
      return reportDates(await loadVisits());
    },
  },
  analyser: {
    async analyse(visitId) {
      // PIPELINE_RUNNER=local: the app's own machine has Python and the pipeline keys, so score this clip
      // now and email the owner (run_clip.py --notify). Not for Vercel, which can't run Python.
      if (process.env.PIPELINE_RUNNER === "local") return runLocally(visitId);
      // Stream 2's pipeline (.github/workflows/pipeline.yml) picks up every `uploaded` visit every
      // 5 minutes and sets it to `analysed` or `failed`. With a token set, start it now instead.
      // A failed dispatch only means the clip waits for the next scheduled run.
      const token = process.env.GITHUB_DISPATCH_TOKEN;
      const repo = process.env.GITHUB_PIPELINE_REPO;
      if (!token || !repo) {
        console.info("[ux/analyse] queued for the scheduled pipeline", visitId);
        return;
      }
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/pipeline.yml/dispatches`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
          body: JSON.stringify({ ref: process.env.GITHUB_PIPELINE_REF ?? "main", inputs: { job: "pending" } }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        console.info("[ux/analyse] pipeline started", visitId);
      } catch (e) {
        console.error("[ux/analyse] couldn't start the pipeline; the scheduled run will pick it up", visitId, e);
      }
    },
  },
};

/** Starts `run_clip.py --visit <id> --notify` in the background; its output goes to logs/pipeline/<id>.log. */
function runLocally(visitId: string) {
  const root = process.cwd();
  const logDir = path.join(root, "logs", "pipeline");
  mkdirSync(logDir, { recursive: true });
  const log = openSync(path.join(logDir, `${visitId}.log`), "a");
  const child = spawn(process.env.PIPELINE_PYTHON ?? "python3", ["pipeline/run_clip.py", "--visit", visitId, "--notify", "--out", path.join(logDir, "runs")], {
    cwd: root,
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, APP_BASE_URL: process.env.APP_BASE_URL ?? "http://localhost:3000" },
  });
  child.on("error", (e) => console.error("[ux/analyse] couldn't start the local pipeline", visitId, e));
  child.unref();
  console.info("[ux/analyse] local pipeline started", visitId, `logs/pipeline/${visitId}.log`);
}
