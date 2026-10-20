// Types generated from schemas.md and CLAUDE.md. Do not add fields here that are not in
// those files; UX-only fields live in lib/data/types.ts.

export const STORES = ["B1", "B2", "B3"] as const;
export type Store = (typeof STORES)[number];

export const OUTCOMES = ["bought", "deferred_with_follow_up", "walked_out"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const REASONS_NOT_BOUGHT = [
  "weight_mismatch",
  "design_not_available",
  "price_making_charge",
  "old_gold_exchange_rate",
  "purity_trust",
  "family_decision",
  "just_browsing",
  "other",
] as const;
export type ReasonNotBought = (typeof REASONS_NOT_BOUGHT)[number];

/** Lost demand = not bought because we didn't show or didn't have what was asked. */
export const LOST_DEMAND_REASONS: readonly ReasonNotBought[] = ["weight_mismatch", "design_not_available"];

export const EMOTION_CUES = ["words", "voice", "face"] as const;
export type EmotionCue = (typeof EMOTION_CUES)[number];

/** `visits.status` in schemas.md: uploaded → analysed → failed. */
export const VISIT_STATUSES = ["uploaded", "analysed", "failed"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export interface AskedFor {
  category: string;
  weight_band: string | null;
  occasion?: string | null;
  budget_inr?: number | null;
}

export interface Objection {
  type: string;
  at: string; // "mm:ss"
  quote?: string;
  competitor_mentioned?: boolean;
}

export interface Emotion {
  at: string;
  who: string;
  emotion: string;
  /** schemas.md: "words | voice | face"; hand labels use "words: '<evidence>'". */
  cue: string;
}

/** The visit JSON from schemas.md (stored in `visits.analysis`). */
export interface VisitAnalysis {
  visit_id: string;
  store: Store;
  salesperson: string;
  date: string; // YYYY-MM-DD
  outcome: Outcome;
  asked_for: AskedFor;
  shown: string[];
  reason_not_bought: ReasonNotBought | null;
  objections: Objection[];
  emotions: Emotion[];
  emotion_arc: string;
  handling_score: number; // 1-5
  coaching_tip: string;
  lost_demand: boolean;
  flags: string[];
}

/** The `visits` table from schemas.md. */
export interface VisitRow {
  id: string;
  store: Store;
  salesperson: string;
  recorded_at: string; // timestamptz
  media_path: string;
  status: VisitStatus;
  analysis: VisitAnalysis | null;
}

/** Shape of expected_outputs/daily_report_reference.json (the report test oracle). */
export interface DailyReportReference {
  visits: number;
  bought: number;
  conversion_pct: number;
  sales_value_inr: number;
  reasons_not_bought: [ReasonNotBought, number][];
  by_store: Record<string, [bought: number, visits: number]>;
  by_salesperson: [name: string, bought: number, visits: number][];
  b2_light_necklace_asks: number;
  b2_light_necklace_lost: number;
  b3_exchange_share_of_losses: string;
  competitor_mentions: number;
  busiest_hours: [hour: number, visits: number][];
  follow_ups_due: number;
}
