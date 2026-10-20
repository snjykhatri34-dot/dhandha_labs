// Pure: DailyReport → what the owner report renders. Every number traces to report.numbers.
import type { DailyReport } from "@/lib/data/types";
import { formatDate, formatInr, hourLabel, reasonLabel } from "@/lib/ux/format";

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
    `${n.visits} counter visits, ${n.bought} sales (${n.conversion_pct}%), ≈${formatInr(n.sales_value_inr)}.` +
    (topReason ? ` The biggest leak is ${reasonLabel(topReason[0]).toLowerCase()}: ${topReason[1]} visits.` : "");

  const sections: ReportSectionView[] = [
    {
      key: "lostSales",
      title: "Lost sales and why",
      summary: `${notBought} visits did not buy.${n.competitor_mentions ? ` ${n.competitor_mentions} mentioned a competitor.` : ""}`,
      rows: n.reasons_not_bought.map(([reason, count]) => ({
        label: reasonLabel(reason),
        value: String(count),
        share: count / maxReason,
      })),
      action: report.actions.lostSales,
    },
    {
      key: "lostDemand",
      title: "Lost demand",
      summary: hot
        ? `${hot.store} had ${hot.asks} asks for ${hot.weightBand} g ${hot.category}s and lost ${hot.lost}.`
        : "No lost demand today.",
      action: report.actions.lostDemand,
    },
    {
      key: "storePattern",
      title: "Store pattern",
      summary: pattern
        ? `At ${pattern.store}, ${pattern.count} of ${pattern.losses} losses were about ${reasonLabel(pattern.reason).toLowerCase()}.`
        : "No store stands out today.",
      rows: Object.entries(n.by_store).map(([store, [bought, visits]]) => ({
        label: store,
        value: `${bought}/${visits}`,
        share: visits ? bought / visits : 0,
        note: `${Math.round((bought / visits) * 100)}%`,
      })),
      action: report.actions.storePattern,
    },
    {
      key: "salespeople",
      title: "Salespeople",
      summary: "Sold / visits, best conversion first.",
      rows: n.by_salesperson.map(([name, bought, visits]) => ({
        label: name,
        value: `${bought}/${visits}`,
        share: visits ? bought / visits : 0,
        note: `${Math.round((bought / visits) * 100)}%`,
      })),
      action: report.actions.salespeople,
    },
    {
      key: "busiestHours",
      title: "Busiest hours",
      rows: n.busiest_hours.map(([hour, visits]) => ({
        label: hourLabel(hour),
        value: `${visits} visits`,
        share: visits / (n.busiest_hours[0]?.[1] || 1),
      })),
      action: report.actions.busiestHours,
    },
    {
      key: "followUps",
      title: "Follow-ups due",
      summary: `${n.follow_ups_due} customers deferred and need a call.`,
      visitIds: report.followUpVisitIds,
      action: report.actions.followUps,
    },
  ];

  return {
    title: `Daily report · ${formatDate(report.date)}${report.store ? ` · ${report.store}` : " · all stores"}`,
    headline,
    kpis: [
      { label: "Visits", value: String(n.visits) },
      { label: "Sales", value: `${n.conversion_pct}%`, sub: `${n.bought} bought` },
      { label: "Value", value: formatInr(n.sales_value_inr) },
    ],
    sections,
  };
}
