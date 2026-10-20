// Pure: Visit → what the scorecard page renders. Every line cites the visit's own fields.
import type { Visit } from "@/lib/data/types";
import { formatDate, formatInr, reasonLabel } from "@/lib/ux/format";

export type TimelineKind = "objection" | "emotion" | "moment" | "missed" | "stockGap" | "competitor";
export type Tone = "good" | "bad" | "warn" | "neutral";

export interface TimelineItem {
  at: string; // "mm:ss"
  kind: TimelineKind;
  tone: Tone;
  title: string;
  detail?: string;
  /** Emotions must name their cue: words, voice or face. */
  cue?: string;
}

export interface VisitView {
  id: string;
  heading: string;
  when: string;
  askedFor: string | null;
  shown: string[];
  reason: string | null;
  lostDemand: boolean;
  value: string | null;
  handling: { score: number; evidence: string | null; tip: string | null } | null;
  customer: { line: string; evidence: string | null } | null;
  emotionArc: string | null;
  timeline: TimelineItem[];
  facts: { label: string; value: string }[];
  flags: string[];
  /** Summary-only visit (e.g. the sample day): no transcript detail to show. */
  summaryOnly: boolean;
}

const KIND_LABEL: Record<TimelineKind, string> = {
  objection: "Objection",
  emotion: "Emotion",
  moment: "Key moment",
  missed: "Missed chance",
  stockGap: "Not available",
  competitor: "Competitor",
};
export const timelineKindLabel = (k: TimelineKind) => KIND_LABEL[k];

const humanise = (s: string) => s.replaceAll("_", " ");
/** "00:24" → 24 (seconds), for sorting; unknown formats sort last. */
const seconds = (at: string) => {
  const [m, s] = at.split(":").map(Number);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : Number.MAX_SAFE_INTEGER;
};

export function toVisitView(v: Visit): VisitView {
  const timeline: TimelineItem[] = [
    ...v.objections.map((o): TimelineItem => ({
      at: o.at,
      kind: "objection",
      tone: "warn",
      title: reasonLabel(o.type),
      detail: [o.quote && `“${o.quote}”`, o.competitor_mentioned && "mentioned a competitor"].filter(Boolean).join(" · ") || undefined,
    })),
    ...v.emotions.map((e): TimelineItem => ({
      at: e.at,
      kind: "emotion",
      tone: "neutral",
      title: `${e.who === "customer" ? "Customer" : e.who} felt ${e.emotion}`,
      cue: e.cueType ? `${e.cueType}${e.cueEvidence ? `: ${e.cueEvidence}` : ""}` : "no cue given",
    })),
    ...v.keyMoments.map((k): TimelineItem => ({
      at: k.at,
      kind: "moment",
      tone: k.effect === "helped" ? "good" : k.effect === "hurt" ? "bad" : "neutral",
      title: `${k.by === "salesperson" ? "Salesperson" : k.by} ${k.effect === "helped" ? "helped" : k.effect === "hurt" ? "hurt" : k.effect}`,
      detail: k.what,
    })),
    ...v.missedOpportunities.map((m): TimelineItem => ({ at: m.at, kind: "missed", tone: "bad", title: m.what })),
    ...v.notAvailable.map((n): TimelineItem => ({
      at: n.at,
      kind: "stockGap",
      tone: n.resolution === "none" ? "bad" : "warn",
      title: n.item,
      detail: `“${n.quote}” · resolution: ${humanise(n.resolution)}`,
    })),
    ...(v.competitor
      ? [{ at: v.competitor.at, kind: "competitor" as const, tone: "warn" as const, title: v.competitor.named, detail: v.competitor.claim }]
      : []),
  ].sort((a, b) => seconds(a.at) - seconds(b.at));

  const a = v.askedFor;
  const askedFor = a
    ? [a.category, a.weight_band && `${a.weight_band} g`, a.occasion && `for ${a.occasion}`, a.budget_inr && `budget ${formatInr(a.budget_inr)}`]
        .filter(Boolean)
        .join(" · ")
    : null;

  const facts: VisitView["facts"] = [];
  if (v.priceTalk) {
    const p = v.priceTalk;
    if (p.making_pct !== null) facts.push({ label: "Making charge", value: `${p.making_pct}%` });
    if (p.total_quoted_inr !== null) facts.push({ label: "Quoted", value: formatInr(p.total_quoted_inr) });
    if (p.breakup_given !== null) facts.push({ label: "Price breakup given", value: p.breakup_given ? "Yes" : "No" });
    if (p.notes) facts.push({ label: "Price notes", value: p.notes });
  }
  if (v.nextStep) facts.push({ label: "Next step", value: `${v.nextStep.what} · ${v.nextStep.when} · ${v.nextStep.who}` });
  if (v.durationMin !== null) facts.push({ label: "Duration", value: `${v.durationMin} min` });

  return {
    id: v.id,
    heading: `${v.salesperson} · ${v.store}`,
    when: [formatDate(v.date), v.startTime].filter(Boolean).join(" · "),
    askedFor,
    shown: v.shown,
    reason: v.reasonNotBought ? reasonLabel(v.reasonNotBought) : null,
    lostDemand: v.lostDemand === true,
    value: v.valueInr ? formatInr(v.valueInr) : null,
    handling:
      v.handlingScore !== null ? { score: v.handlingScore, evidence: v.handlingEvidence, tip: v.coachingTip } : null,
    customer: v.customer
      ? {
          line: [v.customer.party, `${v.customer.intent} intent`, `decides: ${v.customer.decision_maker}`].join(" · "),
          evidence: v.customer.intent_evidence || null,
        }
      : null,
    emotionArc: v.emotionArc ? v.emotionArc.replace("->", "→") : null,
    timeline,
    facts,
    flags: v.flags,
    summaryOnly: timeline.length === 0 && !v.coachingTip,
  };
}
