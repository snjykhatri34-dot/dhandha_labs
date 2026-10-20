// Maps Stream 2's tables (supabase/migrations) to the UX types. All schema differences are
// absorbed here, never in components.
import { analysisFields, NO_ANALYSIS, type ScorecardJson } from "@/lib/data/normalise";
import type { Review, Visit } from "@/lib/data/types";
import type { DailyReportReference, Store, VisitStatus } from "@/lib/types/scorecard";

/** Stores are in India; recorded_at is stored in UTC. */
export const STORE_TIME_ZONE = "Asia/Kolkata";

export interface VisitDbRow {
  id: string;
  store: string;
  salesperson: string;
  recorded_at: string | null;
  media_path: string | null;
  status: VisitStatus;
  analysis: (ScorecardJson & { date?: string; error?: string }) | null;
  created_at: string;
}

export interface ReviewDbRow {
  visit_id: string;
  status: "approved" | "rejected";
  reviewed_by: string;
  reviewed_at: string;
}

export interface DailyReportDbRow {
  id: string;
  report_date: string; // YYYY-MM-DD
  store: string; // "ALL" = all stores
  numbers: DailyReportReference;
  markdown: string;
  created_at: string;
}

/** UTC timestamp → { date: "2026-10-17", time: "19:10" } in the stores' time zone. */
export function storeLocal(iso: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: STORE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function reviewFromRow(row: ReviewDbRow | undefined): Review {
  return row
    ? { status: row.status, by: row.reviewed_by, at: row.reviewed_at }
    : { status: "pending", by: null, at: null };
}

export function rowToVisit(row: VisitDbRow, review?: ReviewDbRow): Visit {
  const a = row.analysis;
  const local = row.recorded_at ? storeLocal(row.recorded_at) : null;
  return {
    id: row.id,
    store: row.store as Store,
    salesperson: row.salesperson,
    // The scorecard's own date wins; else the recording time in store time; else when the row was made.
    date: a?.date ?? local?.date ?? storeLocal(row.created_at).date,
    startTime: a?.start ?? local?.time ?? null,
    durationMin: a?.duration_min ?? null,
    status: row.status,
    mediaPath: row.media_path,
    ...(a && row.status === "analysed" ? analysisFields(a) : NO_ANALYSIS),
    error: row.status === "failed" ? (a?.error ?? "Analysis failed. Stream 2's pipeline didn't record why.") : null,
    review: reviewFromRow(review),
  };
}
