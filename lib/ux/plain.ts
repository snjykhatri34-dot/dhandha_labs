// Plain-language wording for everything the analysis produces. Pages show these, never raw
// field names or enum values, so a shop owner or salesperson can read every line.
import type { Outcome } from "@/lib/types/scorecard";

const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const words = (s: string) => s.replaceAll("_", " ").trim();

export const OUTCOME_TEXT: Record<Outcome, string> = {
  bought: "Bought",
  deferred_with_follow_up: "Needs follow-up",
  walked_out: "Walked out",
};

const OBJECTION_TEXT: Record<string, string> = {
  weight: "Weight wasn't right",
  weight_mismatch: "Weight wasn't right",
  price_making_charge: "Making charge too high",
  price_budget: "Over their budget",
  price: "Price too high",
  design_not_available: "Design not available",
  old_gold_exchange_rate: "Old-gold exchange rate",
  purity_trust: "Doubts about purity",
  family_decision: "Wants family to decide",
  just_browsing: "Just browsing",
};
export const concernText = (type: string) => OBJECTION_TEXT[type] ?? sentence(words(type));

const CUE_TEXT: Record<string, string> = { words: "what they said", voice: "their tone of voice", face: "their expression" };
/** "How we know": the evidence behind an emotion. */
export function cueText(type: string | null, evidence: string | null): string {
  if (!type) return evidence ? `From ${evidence}` : "No evidence recorded";
  const how = CUE_TEXT[type] ?? type;
  return evidence ? `From ${how}: ${evidence}` : `From ${how}`;
}

const PARTY_TEXT: Record<string, string> = { solo: "On their own", couple: "As a couple", family: "With family", group: "In a group" };
export const partyText = (p: string) => PARTY_TEXT[p] ?? sentence(words(p));

const INTENT_TEXT: Record<string, string> = { high: "Very keen to buy", medium: "Somewhat keen", low: "Just looking" };
export const intentText = (i: string) => INTENT_TEXT[i] ?? sentence(words(i));

const RESOLUTION_TEXT: Record<string, string> = {
  none: "Nothing else was offered",
  another_branch: "Offered it from another branch",
  order: "Offered to order it",
  callback: "Promised to call back",
  alternative: "Offered something similar",
};
export const resolutionText = (r: string) => RESOLUTION_TEXT[r] ?? sentence(words(r));

const SCORE_WORDS = ["", "Poor", "Weak", "Okay", "Good", "Excellent"];
export const handlingWord = (score: number) => SCORE_WORDS[Math.round(score)] ?? "";

/** "interested -> disappointed" → "Interested → Disappointed" */
export const moodText = (arc: string) =>
  arc
    .split(/\s*->\s*|\s*→\s*/)
    .map((m) => sentence(words(m)))
    .join(" → ");

/** Action lines cite moments as "B2-1015 @00:31": read that as "B2-1015 at 0:31". */
export const plainAction = (text: string) => text.replace(/@(\d\d:\d\d)/g, (_, t: string) => `at ${clipTime(t)}`);

/** "00:24" → "0:24" (minutes into the clip) */
export const clipTime = (at: string) => at.replace(/^0(\d:)/, "$1");

// The analysis writes short working notes ("flags") when it isn't sure. They use the scorecard's
// field names, so translate those before a manager reads them.
const NOTE_TERMS: [RegExp, string][] = [
  [/\btotal_quoted_inr\b/g, "quoted price"],
  [/\bmaking_pct\b/g, "making charge"],
  [/\bweight_band\b/g, "weight range"],
  [/\bwalked_out\b/g, "walked out"],
  [/\bdeferred_with_follow_up\b/g, "follow-up"],
  [/\bweight_mismatch\b/g, "weight mismatch"],
  [/\bdesign_not_available\b/g, "design not available"],
  [/\bprice_making_charge\b/g, "making charge"],
  [/\bold_gold_exchange_rate\b/g, "old-gold exchange"],
  [/\bpurity_trust\b/g, "purity doubts"],
  [/\bfamily_decision\b/g, "family decision"],
  [/\bjust_browsing\b/g, "just browsing"],
  [/\bHUID\b/g, "hallmark number (HUID)"],
  [/\bnot scored as an objection\b/g, "not counted as a concern"],
  [/\bparty scored( as)?\b/g, "group recorded as"],
  [/\bscored\b/g, "recorded"],
  [/\bband\b/g, "weight range"],
  [/\boutcome borderline\b/g, "outcome unclear"],
];

/** Plain-language version of an analysis note, or null for notes meant only for developers. */
export function plainNote(note: string): string | null {
  if (/^mock:/i.test(note)) return null;
  let text = note;
  for (const [pattern, replacement] of NOTE_TERMS) text = text.replace(pattern, replacement);
  return sentence(words(text));
}
