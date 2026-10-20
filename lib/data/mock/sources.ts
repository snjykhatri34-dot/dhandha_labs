// Loads the synthetic data already in the repo and normalises it into `Visit`.
// Sources: data/sample_day (102 slim visits), expected_outputs/visits (6 hand labels) and
// evaluator/runs/2026-10-20-v4 (Stream 2's latest SOP output for the same 6 conversations).

import sampleDay from "@/data/sample_day/visits_2026-10-17.json";
import akshay1014 from "@/expected_outputs/visits/B2_Akshay_2026-10-15_1014.json";
import priya1015 from "@/expected_outputs/visits/B2_Priya_2026-10-15_1015.json";
import akshay1016 from "@/expected_outputs/visits/B2_Akshay_2026-10-16_1016.json";
import priya1017 from "@/expected_outputs/visits/B2_Priya_2026-10-16_1017.json";
import akshay1018 from "@/expected_outputs/visits/B2_Akshay_2026-10-17_1018.json";
import rohit1019 from "@/expected_outputs/visits/B2_Rohit_2026-10-17_1019.json";
import run1014 from "@/evaluator/runs/2026-10-20-v4/B2-1014.json";
import run1015 from "@/evaluator/runs/2026-10-20-v4/B2-1015.json";
import run1016 from "@/evaluator/runs/2026-10-20-v4/B2-1016.json";
import run1017 from "@/evaluator/runs/2026-10-20-v4/B2-1017.json";
import run1018 from "@/evaluator/runs/2026-10-20-v4/B2-1018.json";
import run1019 from "@/evaluator/runs/2026-10-20-v4/B2-1019.json";
import type { Visit, VisitEmotion } from "@/lib/data/types";
import type { EmotionCue, Outcome, ReasonNotBought, Store, VisitAnalysis } from "@/lib/types/scorecard";
import { EMOTION_CUES } from "@/lib/types/scorecard";

export const SAMPLE_DAY_DATE = "2026-10-17";

interface SampleDayVisit {
  visit_id: string;
  store: string;
  salesperson: string;
  date: string;
  start: string;
  duration_min: number;
  outcome: string;
  asked_for: { category: string; weight_band: string };
  reason_not_bought: string | null;
  competitor_mentioned: boolean;
  emotion_arc: string;
  handling_score: number;
  lost_demand: boolean;
  value_inr: number;
}

/** A full scorecard: hand labels use `branch`/`customer_sentiment_arc`, schemas.md uses `store`/`emotion_arc`. */
type LabelledVisit = Partial<Pick<VisitAnalysis, "customer" | "key_moments" | "missed_opportunities" | "next_step" | "price_talk" | "not_available" | "competitor">> & {
  visit_id: string;
  branch?: string;
  store?: string;
  emotion_arc?: string;
  salesperson: string;
  date: string;
  outcome: string;
  asked_for: { category: string; weight_band?: string | null; occasion?: string | null; budget_inr?: number | null };
  shown?: string[];
  objections?: { type: string; at: string; quote?: string; competitor_mentioned?: boolean }[];
  handling_score: number;
  handling_evidence?: string;
  customer_sentiment_arc?: string;
  lost_demand: boolean;
  coaching_tip?: string;
  reason_not_bought: string | null;
  emotions?: { at: string; who: string; emotion: string; cue: string }[];
  flags?: string[];
};

const pendingReview = { status: "pending" as const, by: null, at: null };

export const NO_NUANCE: Pick<
  Visit,
  "customer" | "keyMoments" | "missedOpportunities" | "nextStep" | "priceTalk" | "notAvailable" | "competitor"
> = {
  customer: null,
  keyMoments: [],
  missedOpportunities: [],
  nextStep: null,
  priceTalk: null,
  notAvailable: [],
  competitor: null,
};

/** "words: 'That's far too heavy'" → { cueType: "words", cueEvidence: "'That's far too heavy'" } */
export function parseCue(cue: string): Pick<VisitEmotion, "cueType" | "cueEvidence"> {
  const [head, ...rest] = cue.split(":");
  const type = head.trim().toLowerCase();
  const cueType = (EMOTION_CUES as readonly string[]).includes(type) ? (type as EmotionCue) : null;
  const evidence = rest.join(":").trim();
  return { cueType, cueEvidence: evidence || null };
}

export function fromSampleDay(v: SampleDayVisit): Visit {
  return {
    id: v.visit_id,
    store: v.store as Store,
    salesperson: v.salesperson,
    date: v.date,
    startTime: v.start,
    durationMin: v.duration_min,
    status: "analysed",
    mediaPath: null,
    outcome: v.outcome as Outcome,
    askedFor: { category: v.asked_for.category, weight_band: v.asked_for.weight_band },
    shown: [],
    reasonNotBought: v.reason_not_bought as ReasonNotBought | null,
    objections: [],
    emotions: [],
    emotionArc: v.emotion_arc,
    handlingScore: v.handling_score,
    handlingEvidence: null,
    coachingTip: null,
    lostDemand: v.lost_demand,
    competitorMentioned: v.competitor_mentioned,
    valueInr: v.value_inr,
    flags: [],
    ...NO_NUANCE,
    error: null,
    // The sample day is a past, already-reviewed day.
    review: { status: "approved", by: "sample data", at: null },
  };
}

export function fromLabelled(v: LabelledVisit): Visit {
  const objections = v.objections ?? [];
  return {
    id: v.visit_id,
    store: (v.store ?? v.branch) as Store,
    salesperson: v.salesperson,
    date: v.date,
    startTime: null,
    durationMin: null,
    status: "analysed",
    mediaPath: null,
    outcome: v.outcome as Outcome,
    askedFor: {
      category: v.asked_for.category,
      weight_band: v.asked_for.weight_band ?? null,
      occasion: v.asked_for.occasion ?? null,
      budget_inr: v.asked_for.budget_inr ?? null,
    },
    shown: v.shown ?? [],
    reasonNotBought: v.reason_not_bought as ReasonNotBought | null,
    objections,
    emotions: (v.emotions ?? []).map((e) => ({ at: e.at, who: e.who, emotion: e.emotion, ...parseCue(e.cue) })),
    emotionArc: v.emotion_arc ?? v.customer_sentiment_arc ?? null,
    handlingScore: v.handling_score,
    handlingEvidence: v.handling_evidence ?? null,
    coachingTip: v.coaching_tip ?? null,
    lostDemand: v.lost_demand,
    competitorMentioned: objections.some((o) => o.competitor_mentioned === true) || Boolean(v.competitor),
    valueInr: null,
    flags: v.flags ?? [],
    customer: v.customer ?? null,
    keyMoments: v.key_moments ?? [],
    missedOpportunities: v.missed_opportunities ?? [],
    nextStep: v.next_step ?? null,
    priceTalk: v.price_talk ?? null,
    notAvailable: v.not_available ?? [],
    competitor: v.competitor ?? null,
    error: null,
    // Hand-labelled scorecards start in the manager's review queue.
    review: pendingReview,
  };
}

export const LABELLED_VISITS: Visit[] = [akshay1014, priya1015, akshay1016, priya1017, akshay1018, rohit1019].map(
  (v) => fromLabelled(v as LabelledVisit),
);

/** Stream 2's SOP output for the six conversations: what a real analysed visit looks like. */
export const PIPELINE_RUN_VISITS: Visit[] = [run1014, run1015, run1016, run1017, run1018, run1019].map((v) =>
  fromLabelled(v as LabelledVisit),
);

export const SAMPLE_DAY_VISITS: Visit[] = (sampleDay as SampleDayVisit[]).map(fromSampleDay);
