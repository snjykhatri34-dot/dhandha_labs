// One normaliser for every scorecard shape we've seen, used by the mock and by Supabase:
// - schemas.md visit JSON (store, emotion_arc) and Stream 2's pipeline output
// - hand labels in expected_outputs/visits (branch, customer_sentiment_arc, handling_evidence)
// - sample-day extras (start, duration_min, competitor_mentioned, value_inr)
// Fields a source doesn't have become null/empty. Nothing is invented.

import type { Visit, VisitEmotion } from "@/lib/data/types";
import type { EmotionCue, Outcome, ReasonNotBought, VisitAnalysis } from "@/lib/types/scorecard";
import { EMOTION_CUES } from "@/lib/types/scorecard";

export type ScorecardJson = Partial<Omit<VisitAnalysis, "store" | "outcome" | "reason_not_bought" | "asked_for">> & {
  visit_id?: string;
  store?: string;
  branch?: string;
  outcome?: string;
  reason_not_bought?: string | null;
  asked_for?: { category: string; weight_band?: string | null; occasion?: string | null; budget_inr?: number | null };
  customer_sentiment_arc?: string;
  handling_evidence?: string;
  start?: string;
  duration_min?: number;
  competitor_mentioned?: boolean;
  value_inr?: number;
};

/** The analysis-derived part of a Visit. */
export type AnalysisFields = Pick<
  Visit,
  | "outcome"
  | "askedFor"
  | "shown"
  | "reasonNotBought"
  | "objections"
  | "emotions"
  | "emotionArc"
  | "handlingScore"
  | "handlingEvidence"
  | "coachingTip"
  | "lostDemand"
  | "competitorMentioned"
  | "valueInr"
  | "flags"
  | "customer"
  | "keyMoments"
  | "missedOpportunities"
  | "nextStep"
  | "priceTalk"
  | "notAvailable"
  | "competitor"
>;

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

/** Before analysis: every analysis field empty. */
export const NO_ANALYSIS: AnalysisFields = {
  outcome: null,
  askedFor: null,
  shown: [],
  reasonNotBought: null,
  objections: [],
  emotions: [],
  emotionArc: null,
  handlingScore: null,
  handlingEvidence: null,
  coachingTip: null,
  lostDemand: null,
  competitorMentioned: null,
  valueInr: null,
  flags: [],
  ...NO_NUANCE,
};

/** "words: 'That's far too heavy'" → { cueType: "words", cueEvidence: "'That's far too heavy'" } */
export function parseCue(cue: string): Pick<VisitEmotion, "cueType" | "cueEvidence"> {
  const [head, ...rest] = cue.split(":");
  const type = head.trim().toLowerCase();
  const cueType = (EMOTION_CUES as readonly string[]).includes(type) ? (type as EmotionCue) : null;
  const evidence = rest.join(":").trim();
  return { cueType, cueEvidence: evidence || null };
}

export function analysisFields(a: ScorecardJson): AnalysisFields {
  const objections = a.objections ?? [];
  return {
    outcome: (a.outcome ?? null) as Outcome | null,
    askedFor: a.asked_for
      ? {
          category: a.asked_for.category,
          weight_band: a.asked_for.weight_band ?? null,
          occasion: a.asked_for.occasion ?? null,
          budget_inr: a.asked_for.budget_inr ?? null,
        }
      : null,
    shown: a.shown ?? [],
    reasonNotBought: (a.reason_not_bought ?? null) as ReasonNotBought | null,
    objections,
    emotions: (a.emotions ?? []).map((e) => ({ at: e.at, who: e.who, emotion: e.emotion, ...parseCue(e.cue ?? "") })),
    emotionArc: a.emotion_arc ?? a.customer_sentiment_arc ?? null,
    handlingScore: a.handling_score ?? null,
    handlingEvidence: a.handling_evidence ?? null,
    coachingTip: a.coaching_tip ?? null,
    lostDemand: a.lost_demand ?? null,
    competitorMentioned:
      a.competitor_mentioned ?? (objections.some((o) => o.competitor_mentioned === true) || Boolean(a.competitor)),
    valueInr: a.value_inr ?? null,
    flags: a.flags ?? [],
    customer: a.customer ?? null,
    keyMoments: a.key_moments ?? [],
    missedOpportunities: a.missed_opportunities ?? [],
    nextStep: a.next_step ?? null,
    priceTalk: a.price_talk ?? null,
    notAvailable: a.not_available ?? [],
    competitor: a.competitor ?? null,
  };
}
