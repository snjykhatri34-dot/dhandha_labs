// Mock report builder: computes a DailyReport from visits. Stream 2 owns the real
// builder. This one exists so the UX runs on mock data, and it's checked against
// expected_outputs/daily_report_reference.json by tests/ux/report.reference.test.ts.

import type { DailyReport, Visit } from "@/lib/data/types";
import type { DailyReportReference, ReasonNotBought } from "@/lib/types/scorecard";
import { LOST_DEMAND_REASONS } from "@/lib/types/scorecard";
import { hourLabel, REASON_LABELS } from "@/lib/ux/format";

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

/** Count by key, keeping first-seen order for ties, sorted by count descending. */
function countBy<T>(items: T[], key: (t: T) => string | null): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function buildReportNumbers(visits: Visit[]): DailyReportReference {
  const bought = visits.filter((v) => v.outcome === "bought");
  const notBought = visits.filter((v) => v.outcome !== "bought");

  const byStore: DailyReportReference["by_store"] = {};
  for (const v of visits) {
    const [b, n] = byStore[v.store] ?? [0, 0];
    byStore[v.store] = [b + (v.outcome === "bought" ? 1 : 0), n + 1];
  }

  const people = new Map<string, [number, number]>();
  for (const v of visits) {
    const [b, n] = people.get(v.salesperson) ?? [0, 0];
    people.set(v.salesperson, [b + (v.outcome === "bought" ? 1 : 0), n + 1]);
  }
  const bySalesperson = [...people.entries()]
    .map(([name, [b, n]]) => [name, b, n] as [string, number, number])
    .sort((a, b) => b[1] / b[2] - a[1] / a[2] || b[1] - a[1]);

  const hotspot = lostDemandHotspot(visits);
  const pattern = storePattern(visits);

  return {
    visits: visits.length,
    bought: bought.length,
    conversion_pct: pct(bought.length, visits.length),
    sales_value_inr: visits.reduce((sum, v) => sum + (v.valueInr ?? 0), 0),
    reasons_not_bought: countBy(notBought, (v) => v.reasonNotBought) as [ReasonNotBought, number][],
    by_store: byStore,
    by_salesperson: bySalesperson,
    b2_light_necklace_asks: hotspot?.asks ?? 0,
    b2_light_necklace_lost: hotspot?.lost ?? 0,
    b3_exchange_share_of_losses: pattern ? `${pattern.count}/${pattern.losses}` : "0/0",
    competitor_mentions: visits.filter((v) => v.competitorMentioned).length,
    busiest_hours: countBy(visits, (v) => (v.startTime ? String(Number(v.startTime.slice(0, 2))) : null))
      .slice(0, 3)
      .map(([h, n]) => [Number(h), n]),
    follow_ups_due: visits.filter((v) => v.outcome === "deferred_with_follow_up").length,
  };
}

/** The store + category + weight band with the most lost-demand visits. */
export function lostDemandHotspot(visits: Visit[]): DailyReport["lostDemandHotspot"] {
  const cellKey = (v: Visit) => `${v.store}|${v.askedFor?.category}|${v.askedFor?.weight_band}`;
  const [top] = countBy(visits, (v) => (v.lostDemand && v.askedFor ? cellKey(v) : null));
  if (!top) return null;
  const [store, category, weightBand] = top[0].split("|");
  const cell = visits.filter((v) => cellKey(v) === top[0]);
  return {
    store,
    category,
    weightBand,
    asks: cell.length,
    lost: cell.filter((v) => v.outcome !== "bought").length,
  };
}

/**
 * The store whose loss reason most over-indexes against the company-wide share.
 * Lost-demand reasons are excluded (they have their own section).
 */
export function storePattern(visits: Visit[]): DailyReport["storePattern"] {
  const losses = visits.filter((v) => v.outcome !== "bought" && v.reasonNotBought);
  const overall = new Map(countBy(losses, (v) => v.reasonNotBought));
  let best: NonNullable<DailyReport["storePattern"]> | null = null;
  let bestLift = 0;
  for (const store of new Set(losses.map((v) => v.store))) {
    const storeLosses = losses.filter((v) => v.store === store);
    for (const [reason, count] of countBy(storeLosses, (v) => v.reasonNotBought)) {
      if (LOST_DEMAND_REASONS.includes(reason as ReasonNotBought)) continue;
      const lift = count / storeLosses.length - (overall.get(reason) ?? 0) / losses.length;
      if (lift > bestLift) {
        bestLift = lift;
        best = { store, reason: reason as ReasonNotBought, count, losses: storeLosses.length };
      }
    }
  }
  return best;
}

const STORE_PATTERN_ACTIONS: Partial<Record<ReasonNotBought, string>> = {
  old_gold_exchange_rate: "Publish one written exchange formula.",
  price_making_charge: "Show the making-charge breakup in rupees on every quote.",
  purity_trust: "Offer the purity test at the counter, in front of the customer.",
  family_decision: "Take a number and book a family visit before they leave.",
};

/** Mock action lines, written from the numbers with simple rules. Stream 2's report will supply real ones. */
export function buildActions(
  n: DailyReportReference,
  hotspot: DailyReport["lostDemandHotspot"],
  pattern: DailyReport["storePattern"],
): DailyReport["actions"] {
  const [topReason] = n.reasons_not_bought;
  const ranked = n.by_salesperson.filter(([, , visits]) => visits >= 5);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  return {
    headline: topReason ? `Biggest fixable leak: ${REASON_LABELS[topReason[0]].toLowerCase()} (${topReason[1]} visits).` : undefined,
    lostSales: topReason ? `Start with ${REASON_LABELS[topReason[0]].toLowerCase()}: it cost ${topReason[1]} sales.` : undefined,
    lostDemand: hotspot
      ? `Check ${hotspot.store}'s ${hotspot.weightBand} g ${hotspot.category} stock today.`
      : undefined,
    storePattern: pattern ? (STORE_PATTERN_ACTIONS[pattern.reason] ?? `Review ${pattern.store}'s ${REASON_LABELS[pattern.reason].toLowerCase()} losses with the manager.`) : undefined,
    salespeople: best && worst && best !== worst ? `${worst[0]}: pair with ${best[0]} tomorrow.` : undefined,
    busiestHours: n.busiest_hours.length ? `Staff the ${hourLabel(n.busiest_hours[0][0])} peak.` : undefined,
    followUps: n.follow_ups_due ? `Call the ${n.follow_ups_due} deferred customers.` : undefined,
  };
}

export function buildDailyReport(date: string, visits: Visit[], generatedAt: string): DailyReport {
  const numbers = buildReportNumbers(visits);
  const hotspot = lostDemandHotspot(visits);
  const pattern = storePattern(visits);
  return {
    id: `mock-${date}-all`,
    date,
    store: null,
    numbers,
    lostDemandHotspot: hotspot,
    storePattern: pattern,
    actions: buildActions(numbers, hotspot, pattern),
    sourceVisitIds: visits.map((v) => v.id),
    followUpVisitIds: visits.filter((v) => v.outcome === "deferred_with_follow_up").map((v) => v.id),
    generatedAt,
  };
}
