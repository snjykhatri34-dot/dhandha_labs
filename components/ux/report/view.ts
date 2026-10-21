// Pure: DailyReport → what the owner report renders. Every number traces to report.numbers.
import type { DailyReport } from "@/lib/data/types";
import { formatDate, formatInr, hourLabel, reasonLabel } from "@/lib/ux/format";
import { plainAction } from "@/lib/ux/plain";

export interface ReportRow {
  label: string;
  value: string;
  /** 0-1, drawn as a bar behind the row */
  share?: number;
  note?: string;
}

export interface ReportSectionView {
  key: string;
  title: string;
  summary?: string;
  rows?: ReportRow[];
  /** Visit ids to link to */
  visitIds?: string[];
  action?: string;
}

export interface ReportView {
  title: string;
  headline: string;
  /** The day's top action, under the headline. */
  topAction?: string;
  kpis: { label: string; value: string; sub?: string }[];
  sections: ReportSectionView[];
}

export function toReportView(report: DailyReport): ReportView {
  const n = report.numbers;
  const notBought = n.visits - n.bought;
  const [topReason] = n.reasons_not_bought;
  const maxReason = topReason?.[1] ?? 1;
  const hot = report.lostDemandHotspot;
  const pattern = report.storePattern;

  const headline =
    `${n.visits} customers came to the counter and ${n.bought} bought (${n.conversion_pct}%), worth about ${formatInr(n.sales_value_inr)}.` +
    (topReason ? ` The most common reason for not buying: ${reasonLabel(topReason[0]).toLowerCase()} (${topReason[1]} visits).` : "");

  const act = (a?: string) => (a ? plainAction(a) : undefined);

  const sections: ReportSectionView[] = [
    {
      key: "lostSales",
      title: "Why customers didn't buy",
      summary: `${notBought} customers didn't buy.${n.competitor_mentions ? ` ${n.competitor_mentions} mentioned another shop.` : ""}`,
      rows: n.reasons_not_bought.map(([reason, count]) => ({
        label: reasonLabel(reason),
        value: String(count),
        share: count / maxReason,
      })),
      action: act(report.actions.lostSales),
    },
    {
      key: "lostDemand",
      title: "What we didn't have",
      summary: hot
        ? `At store ${hot.store}, ${hot.asks} customers asked for ${hot.weightBand.replace("-", "–")} g ${hot.category}s and ${hot.lost} left without buying.`
        : "Nobody left because we didn't have what they wanted.",
      action: act(report.actions.lostDemand),
    },
    {
      key: "storePattern",
      title: "Stores",
      summary: pattern
        ? `At store ${pattern.store}, ${pattern.count} of ${pattern.losses} lost sales were about the ${reasonLabel(pattern.reason).toLowerCase()}.`
        : "No store stands out today.",
      rows: Object.entries(n.by_store).map(([store, [bought, visits]]) => ({
        label: `Store ${store}`,
        value: `${bought} of ${visits} bought`,
        share: visits ? bought / visits : 0,
        note: `${Math.round((bought / visits) * 100)}%`,
      })),
      action: act(report.actions.storePattern),
    },
    {
      key: "salespeople",
      title: "Salespeople",
      summary: "How many visits ended in a sale, best first.",
      rows: n.by_salesperson.map(([name, bought, visits]) => ({
        label: name,
        value: `${bought} of ${visits}`,
        share: visits ? bought / visits : 0,
        note: `${Math.round((bought / visits) * 100)}%`,
      })),
      action: act(report.actions.salespeople),
    },
    {
      key: "busiestHours",
      title: "Busiest hours",
      rows: n.busiest_hours.map(([hour, visits]) => ({
        label: hourLabel(hour),
        value: `${visits} visits`,
        share: visits / (n.busiest_hours[0]?.[1] || 1),
      })),
      action: act(report.actions.busiestHours),
    },
    {
      key: "followUps",
      title: "Customers to call back",
      summary: `${n.follow_ups_due} customers said they'd decide later.`,
      visitIds: report.followUpVisitIds,
      action: act(report.actions.followUps),
    },
  ];

  return {
    title: `Daily report · ${formatDate(report.date)}${report.store ? ` · ${report.store}` : " · all stores"}`,
    headline,
    topAction: act(report.actions.headline),
    kpis: [
      { label: "Visits", value: String(n.visits) },
      { label: "Bought", value: `${n.conversion_pct}%`, sub: `${n.bought} of ${n.visits}` },
      { label: "Sales value", value: formatInr(n.sales_value_inr) },
    ],
    sections,
  };
}
