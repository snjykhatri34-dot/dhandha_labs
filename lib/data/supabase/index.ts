// Real implementation against Stream 2's Supabase tables (supabase/migrations/20261020160000_init.sql).
// Row shapes are mapped to UX types in ./mapping.ts.
import "server-only";

import { buildDailyReport } from "@/lib/data/report";
import type { DailyReport, DataLayer, Visit } from "@/lib/data/types";
import { byNewest, matchesFilter, nextVisitId } from "@/lib/data/visit-list";
import { actionsFromMarkdown, rowToVisit, type DailyReportDbRow, type ReviewDbRow, type VisitDbRow } from "./mapping";
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
 * Stream 2's saved report for the date if there is one (its numbers win), else a report computed
 * from that day's analysed visits so the owner view still works. `source` says which.
 */
async function reportFor(date: string, all: Visit[]): Promise<DailyReport | null> {
  const dayVisits = all.filter((v) => v.date === date && v.status === "analysed");
  const row = await reportRow(date);
  if (!row && dayVisits.length === 0) return null;
  const computed = buildDailyReport(date, dayVisits, row?.created_at ?? new Date().toISOString());
  if (!row) return computed;
  return {
    ...computed,
    id: row.id,
    source: "stream2",
    // Stream 2's numbers win; their markdown's action lines replace the app's short ones.
    numbers: { ...computed.numbers, ...row.numbers },
    actions: { ...computed.actions, ...actionsFromMarkdown(row.markdown) },
    generatedAt: row.created_at,
  };
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
      // Stream 2's pipeline picks up every `uploaded` visit (python3 pipeline/evaluate.py --pending)
      // and sets it to `analysed` or `failed`. There's no trigger yet, so the visit waits as
      // "Analysing" until that runs. Wire a webhook or schedule here once Stream 2 has one.
      console.info("[ux/analyse] queued for Stream 2's pipeline", visitId);
    },
  },
};
