// The data-layer contract for the UX. Pages and components depend on these types and on
// lib/data/index.ts only, never on Supabase or the mock directly.
//
// Changing this file affects Ayse's and Shinjini's work: change it in its own small PR.

import type {
  AskedFor,
  Competitor,
  CustomerProfile,
  DailyReportReference,
  EmotionCue,
  KeyMoment,
  MissedOpportunity,
  NextStep,
  NotAvailable,
  Objection,
  PriceTalk,
  Outcome,
  ReasonNotBought,
  Store,
  VisitStatus,
} from "@/lib/types/scorecard";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Review {
  status: ReviewStatus;
  by: string | null;
  at: string | null; // ISO
}

export interface VisitEmotion {
  at: string;
  who: string;
  emotion: string;
  cueType: EmotionCue | null;
  /** The evidence after the cue type, e.g. "'That's far too heavy'". Null if the source had none. */
  cueEvidence: string | null;
}

/**
 * One visit as the UX sees it: the `visits` row plus its analysis, flattened.
 * Fields the source doesn't have are null or empty, never invented.
 */
export interface Visit {
  id: string;
  store: Store;
  salesperson: string;
  date: string; // YYYY-MM-DD
  /** "HH:MM" local time the visit started, if known. */
  startTime: string | null;
  durationMin: number | null;
  status: VisitStatus;
  mediaPath: string | null;
  // Analysis (null/empty until status is "analysed")
  outcome: Outcome | null;
  askedFor: AskedFor | null;
  shown: string[];
  reasonNotBought: ReasonNotBought | null;
  objections: Objection[];
  emotions: VisitEmotion[];
  emotionArc: string | null;
  handlingScore: number | null;
  handlingEvidence: string | null;
  coachingTip: string | null;
  lostDemand: boolean | null;
  competitorMentioned: boolean | null;
  valueInr: number | null;
  flags: string[];
  // Optional nuance fields (schemas.md, 2026-10-20). Empty/null for older rows and the sample day.
  customer: CustomerProfile | null;
  keyMoments: KeyMoment[];
  missedOpportunities: MissedOpportunity[];
  nextStep: NextStep | null;
  priceTalk: PriceTalk | null;
  /** Stock gaps: what the customer wanted that we said we don't have. */
  notAvailable: NotAvailable[];
  competitor: Competitor | null;
  /** Error shown to the user when status is "failed". */
  error: string | null;
  // UX-owned (stored in ux_visit_reviews, not in `visits`)
  review: Review;
}

export interface NewVisit {
  store: Store;
  salesperson: string;
  /** ISO timestamp of when the clip was recorded. */
  recordedAt: string;
  mediaPath: string;
}

export interface VisitFilter {
  date?: string;
  store?: string;
  salesperson?: string;
  outcome?: string;
  status?: VisitStatus;
  review?: ReviewStatus;
}

export type ReportSection =
  | "headline"
  | "lostSales"
  | "lostDemand"
  | "storePattern"
  | "salespeople"
  | "busiestHours"
  | "followUps";

export interface DailyReport {
  id: string;
  date: string; // YYYY-MM-DD
  /** null = all stores */
  store: Store | null;
  /** Same shape as expected_outputs/daily_report_reference.json. */
  numbers: DailyReportReference;
  /** The biggest lost-demand cell: store + category + weight band. */
  lostDemandHotspot: { store: string; category: string; weightBand: string; asks: number; lost: number } | null;
  /** The store whose loss reason most over-indexes against the company. */
  storePattern: { store: string; reason: ReasonNotBought; count: number; losses: number } | null;
  /** One action line per section, as the brief requires. */
  actions: Partial<Record<ReportSection, string>>;
  /** Visit ids behind the report, for the Sources section. */
  sourceVisitIds: string[];
  /** Deferred visits that need a follow-up. */
  followUpVisitIds: string[];
  generatedAt: string; // ISO
}

export interface VisitRepo {
  list(filter?: VisitFilter): Promise<Visit[]>;
  get(id: string): Promise<Visit | null>;
  /** Upload creates a visit with status "uploaded" and review "pending". */
  create(input: NewVisit): Promise<Visit>;
  setReview(id: string, status: "approved" | "rejected", by: string): Promise<void>;
}

export interface ReportRepo {
  getByDate(date: string): Promise<DailyReport | null>;
  latest(): Promise<DailyReport | null>;
  /** Dates that have a report, newest first. */
  dates(): Promise<string[]>;
}

export interface AnalyseClient {
  /** Triggers Stream 1. The result lands on the visit (status "analysed" or "failed"). */
  analyse(visitId: string): Promise<void>;
}

export interface DataLayer {
  visits: VisitRepo;
  reports: ReportRepo;
  analyser: AnalyseClient;
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet (waiting on Stream 2). Set DATA_SOURCE=mock.`);
    this.name = "NotImplementedError";
  }
}
