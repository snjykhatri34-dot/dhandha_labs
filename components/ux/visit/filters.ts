// Pure helpers for the /owner visit filters, kept in the URL (?store=B2&outcome=walked_out).
import type { Visit, VisitFilter } from "@/lib/data/types";
import { OUTCOMES, STORES } from "@/lib/types/scorecard";

export type SearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZE = 30;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Reads the URL into a repo filter, ignoring values that aren't allowed. */
export function parseVisitFilters(sp: SearchParams): { filter: VisitFilter; showAll: boolean } {
  const store = one(sp.store);
  const outcome = one(sp.outcome);
  const date = one(sp.date);
  return {
    filter: {
      store: store && (STORES as readonly string[]).includes(store) ? store : undefined,
      outcome: outcome && (OUTCOMES as readonly string[]).includes(outcome) ? outcome : undefined,
      salesperson: one(sp.salesperson),
      date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    },
    showAll: one(sp.all) === "1",
  };
}

/** Choices for the dropdowns, from the visits themselves (salespeople narrowed to the chosen store). */
export function filterOptions(all: Visit[], store?: string) {
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  return {
    stores: [...STORES],
    salespeople: uniq(all.filter((v) => !store || v.store === store).map((v) => v.salesperson)),
    dates: uniq(all.map((v) => v.date)).reverse(),
    outcomes: [...OUTCOMES],
  };
}
