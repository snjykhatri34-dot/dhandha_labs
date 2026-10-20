// Turns a daily report into the short WhatsApp summary for the owner. Pure: no I/O.
// Every number comes from report.numbers or report.actions; nothing is hard-coded.
import type { DailyReport } from "@/lib/data/types";
import type { ReasonNotBought } from "@/lib/types/scorecard";

const REASON_TEXT: Record<ReasonNotBought, string> = {
  weight_mismatch: "weight mismatch",
  design_not_available: "design not available",
  price_making_charge: "price / making charge",
  old_gold_exchange_rate: "old-gold exchange rate",
  purity_trust: "purity / trust",
  family_decision: "family decision",
  just_browsing: "just browsing",
  other: "other",
};

/** ₹1,19,26,399 → "₹1.19 crore"; below a crore → "₹12.3 lakh". */
export function formatInr(value: number): string {
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)} crore`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(1)} lakh`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function formatDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function reportLink(baseUrl: string, date: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/owner/reports/${date}`;
}

export function formatReportSummary(report: DailyReport, baseUrl: string): string {
  const n = report.numbers;
  const top = [...n.reasons_not_bought].sort((a, b) => b[1] - a[1])[0];
  const action = report.actions.lostDemand ?? report.actions.headline ?? report.actions.lostSales;
  const scope = report.store ? ` · ${report.store}` : "";

  const lines = [
    `*Counter Intelligence · ${formatDate(report.date)}${scope}*`,
    `${n.visits} visits, ${n.bought} sales (${n.conversion_pct}% conversion), ${formatInr(n.sales_value_inr)}.`,
  ];
  if (top) lines.push(`Top reason for walkouts: ${REASON_TEXT[top[0]]} (${top[1]} visits).`);
  if (action) lines.push(`Today's action: ${action}`);
  lines.push(`Full report: ${reportLink(baseUrl, report.date)}`);
  return lines.join("\n");
}
