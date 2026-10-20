// Who sees which scorecards. Pure, so the rule is tested in one place.
// Owner and manager see everything (unreviewed ones are badged); staff see approved only.
import type { Visit } from "@/lib/data/types";
import type { Role } from "@/lib/ux/role";

export function canSeeScorecard(role: Role, visit: Pick<Visit, "review">): boolean {
  return role !== "staff" || visit.review.status === "approved";
}

export function canReview(role: Role): boolean {
  return role === "manager" || role === "owner";
}

/** Analysed scorecards waiting for a decision, oldest first so nothing sits at the bottom forever. */
export function reviewQueue(visits: Visit[]): Visit[] {
  return visits
    .filter((v) => v.status === "analysed" && v.review.status === "pending")
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.id.localeCompare(b.id));
}

/** Decisions made in this app (the sample day arrives pre-approved and is left out). */
export function recentlyReviewed(visits: Visit[], limit = 10): Visit[] {
  return visits
    .filter((v) => v.review.status !== "pending" && v.review.at)
    .sort((a, b) => (b.review.at ?? "").localeCompare(a.review.at ?? ""))
    .slice(0, limit);
}

export const PAY_NOTICE =
  "Scorecards are coaching notes. They are never the sole basis for pay, incentives or discipline.";
