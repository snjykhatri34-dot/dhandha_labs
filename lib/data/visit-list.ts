// Filtering, ordering and id rules shared by the mock and Supabase repos.
import type { Visit, VisitFilter } from "@/lib/data/types";

export function matchesFilter(v: Visit, f: VisitFilter) {
  return (
    (!f.date || v.date === f.date) &&
    (!f.store || v.store === f.store) &&
    (!f.salesperson || v.salesperson === f.salesperson) &&
    (!f.outcome || v.outcome === f.outcome) &&
    (!f.status || v.status === f.status) &&
    (!f.review || v.review.status === f.review)
  );
}

/** Newest first: date, then start time, then id. */
export function byNewest(a: Visit, b: Visit) {
  return (
    b.date.localeCompare(a.date) ||
    (b.startTime ?? "").localeCompare(a.startTime ?? "") ||
    b.id.localeCompare(a.id)
  );
}

/** Next visit id for a store: one above the highest number used in any store ("B2-1103"). */
export function nextVisitId(store: string, existingIds: Iterable<string>) {
  const numbers = [...existingIds].map((id) => Number(id.split("-")[1])).filter(Number.isFinite);
  return `${store}-${Math.max(1000, ...numbers) + 1}`;
}
