// Display labels and formatters shared by the UX (and the mock report's action lines).
import type { ReasonNotBought } from "@/lib/types/scorecard";

export const REASON_LABELS: Record<ReasonNotBought, string> = {
  weight_mismatch: "Weight mismatch",
  design_not_available: "Design not available",
  price_making_charge: "Price / making charge",
  old_gold_exchange_rate: "Old-gold exchange rate",
  purity_trust: "Purity / trust",
  family_decision: "Family decision",
  just_browsing: "Just browsing",
  other: "Other",
};

export const reasonLabel = (r: string) => {
  const known = REASON_LABELS[r as ReasonNotBought];
  if (known) return known;
  const words = r.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** 13 → "1 PM", 0 → "12 AM" */
export const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;

/** Indian rupees in crore / lakh: 11926399 → "₹1.19 crore", 245000 → "₹2.45 lakh". */
export function formatInr(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} crore`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} lakh`;
  return `₹${n.toLocaleString("en-IN")}`;
}

/** "2026-10-17" → "Sat 17 Oct 2026" (date-only, no timezone shift). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const part = (o: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
  return `${part({ weekday: "short" })} ${d} ${part({ month: "short" })} ${y}`;
}
