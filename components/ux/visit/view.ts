// Pure: Visit → what the scorecard page renders, in plain language.
// Every line comes from the visit's own fields; wording lives in lib/ux/plain.ts.
import type { Visit } from "@/lib/data/types";
import type { Outcome } from "@/lib/types/scorecard";
import { formatDate, formatInr, reasonLabel } from "@/lib/ux/format";
import {
  OUTCOME_TEXT,
  clipTime,
  concernText,
  cueText,
  handlingWord,
  intentText,
  moodText,
  partyText,
  plainNote,
  resolutionText,
} from "@/lib/ux/plain";

export type Tone = "good" | "bad" | "warn" | "neutral";
export type TimelineTag = "Concern" | "Feeling" | "Helped the sale" | "Hurt the sale" | "Missed opportunity" | "Didn't have it" | "Competitor";

export interface TimelineItem {
  at: string; // raw "mm:ss", for sorting and keys
  time: string; // "0:24"
  tag: TimelineTag;
  tone: Tone;
  text: string;
  detail?: string;
}

export interface Row {
  label: string;
  value: string;
  note?: string;
}

export interface VisitView {
  id: string;
  heading: string;
  when: string;
  summary: { outcome: Outcome | null; tone: Tone; title: string; line: string | null };
  details: Row[];
  lostDemand: boolean;
  handling: { score: number; word: string; why: string | null; tip: string | null } | null;
  customer: Row[];
  price: Row[];
  nextStep: Row[];
  timeline: TimelineItem[];
  /** The analysis's own "not sure about this" notes, in plain words. Shown to managers only. */
  notes: string[];
  /** Only summary fields exist (e.g. the sample day): no step-by-step breakdown. */
  summaryOnly: boolean;
}

const OUTCOME_TONE: Record<Outcome, Tone> = { bought: "good", deferred_with_follow_up: "warn", walked_out: "bad" };

const seconds = (at: string) => {
  const [m, s] = at.split(":").map(Number);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : Number.MAX_SAFE_INTEGER;
};

const who = (by: string) => (by === "salesperson" ? "Salesperson" : by === "customer" ? "Customer" : by);

function askedForText(v: Visit): string | null {
  const a = v.askedFor;
  if (!a) return null;
  const piece = a.weight_band ? `${a.category} (${a.weight_band.replace("-", "–")} g)` : a.category;
  return [piece, a.occasion && `for ${a.occasion}`, a.budget_inr && `budget ${formatInr(a.budget_inr)}`].filter(Boolean).join(", ");
}

export function toVisitView(v: Visit): VisitView {
  const timeline: TimelineItem[] = [
    ...v.objections.map((o): TimelineItem => ({
      at: o.at,
      time: clipTime(o.at),
      tag: "Concern",
      tone: "warn",
      text: concernText(o.type),
      detail: [o.quote && `“${o.quote}”`, o.competitor_mentioned && "Mentioned another shop"].filter(Boolean).join(" · ") || undefined,
    })),
    ...v.emotions.map((e): TimelineItem => ({
      at: e.at,
      time: clipTime(e.at),
      tag: "Feeling",
      tone: "neutral",
      text: `${who(e.who)} felt ${e.emotion}`,
      detail: cueText(e.cueType, e.cueEvidence),
    })),
    ...v.keyMoments.map((k): TimelineItem => {
      const helped = k.effect === "helped";
      return {
        at: k.at,
        time: clipTime(k.at),
        tag: helped ? "Helped the sale" : "Hurt the sale",
        tone: helped ? "good" : "bad",
        text: `${who(k.by)} ${k.what}`,
      };
    }),
    ...v.missedOpportunities.map((m): TimelineItem => ({
      at: m.at,
      time: clipTime(m.at),
      tag: "Missed opportunity",
      tone: "bad",
      text: m.what.charAt(0).toUpperCase() + m.what.slice(1),
    })),
    ...v.notAvailable.map((n): TimelineItem => ({
      at: n.at,
      time: clipTime(n.at),
      tag: "Didn't have it",
      tone: n.resolution === "none" ? "bad" : "warn",
      text: `Asked for ${n.item}`,
      detail: `“${n.quote}” · ${resolutionText(n.resolution)}`,
    })),
    ...(v.competitor
      ? [
          {
            at: v.competitor.at,
            time: clipTime(v.competitor.at),
            tag: "Competitor" as const,
            tone: "warn" as const,
            text: `Mentioned ${v.competitor.named}`,
            detail: v.competitor.claim,
          },
        ]
      : []),
  ].sort((a, b) => seconds(a.at) - seconds(b.at));

  const asked = askedForText(v);
  const reason = v.reasonNotBought ? reasonLabel(v.reasonNotBought).toLowerCase() : null;
  const line =
    [asked && `Wanted ${asked}.`, v.outcome !== "bought" && reason && `Didn't buy: ${reason}.`, v.outcome === "bought" && v.valueInr ? `Sale of ${formatInr(v.valueInr)}.` : null]
      .filter(Boolean)
      .join(" ") || null;

  const details: Row[] = [];
  if (asked) details.push({ label: "Asked for", value: asked });
  if (v.shown.length) details.push({ label: "Shown", value: v.shown.join(", ") });
  if (v.outcome && v.outcome !== "bought" && v.reasonNotBought) details.push({ label: "Why they didn't buy", value: reasonLabel(v.reasonNotBought) });
  if (v.valueInr) details.push({ label: "Sale value", value: formatInr(v.valueInr) });
  if (v.durationMin !== null) details.push({ label: "Visit length", value: `${v.durationMin} min` });

  const customer: Row[] = [];
  if (v.customer) {
    customer.push({ label: "Came", value: partyText(v.customer.party) });
    customer.push({ label: "Interest", value: intentText(v.customer.intent), note: v.customer.intent_evidence || undefined });
    if (v.customer.decision_maker) customer.push({ label: "Decides", value: v.customer.decision_maker.replace(/^the /, "The ") });
  }
  if (v.emotionArc) customer.push({ label: "Mood", value: moodText(v.emotionArc) });

  const price: Row[] = [];
  if (v.priceTalk) {
    const p = v.priceTalk;
    if (p.making_pct !== null) price.push({ label: "Making charge", value: `${p.making_pct}%` });
    if (p.total_quoted_inr !== null) price.push({ label: "Price quoted", value: formatInr(p.total_quoted_inr) });
    if (p.breakup_given !== null) price.push({ label: "Explained the price breakup", value: p.breakup_given ? "Yes" : "No" });
    if (p.notes) price.push({ label: "Notes", value: p.notes.charAt(0).toUpperCase() + p.notes.slice(1) });
  }

  const nextStep: Row[] = v.nextStep
    ? [
        { label: "What", value: v.nextStep.what },
        { label: "When", value: v.nextStep.when },
        { label: "Who", value: v.nextStep.who },
      ]
    : [];

  return {
    id: v.id,
    heading: `${v.salesperson} · Store ${v.store}`,
    when: [formatDate(v.date), v.startTime].filter(Boolean).join(" · "),
    summary: {
      outcome: v.outcome,
      tone: v.outcome ? OUTCOME_TONE[v.outcome] : "neutral",
      title: v.outcome ? OUTCOME_TEXT[v.outcome] : "No result yet",
      line,
    },
    details,
    lostDemand: v.lostDemand === true,
    handling:
      v.handlingScore !== null
        ? { score: v.handlingScore, word: handlingWord(v.handlingScore), why: v.handlingEvidence, tip: v.coachingTip }
        : null,
    customer,
    price,
    nextStep,
    timeline,
    notes: v.flags.map(plainNote).filter((n): n is string => n !== null),
    summaryOnly: timeline.length === 0 && !v.coachingTip,
  };
}
