// Server component: loads one visit and shows it only if the current role may see it.
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { canSeeScorecard } from "@/components/ux/review/visibility";
import { EmptyState } from "@/components/ux/shared";
import { visits } from "@/lib/data";
import { getRole } from "@/lib/ux/role";
import { RefreshWhileAnalysing } from "./RefreshWhileAnalysing";
import { VisitScorecard } from "./VisitScorecard";
import { toVisitView } from "./view";

export async function GatedScorecard({ id }: { id: Promise<string> }) {
  await connection();
  const [visit, role] = await Promise.all([visits.get(decodeURIComponent(await id)), getRole()]);
  if (!visit) notFound();
  if (!canSeeScorecard(role, visit)) {
    // Don't reveal anything about an unreviewed scorecard to staff.
    return <EmptyState title="Waiting for manager review">This scorecard appears once a manager approves it.</EmptyState>;
  }
  return (
    <>
      <VisitScorecard visit={visit} view={toVisitView(visit)} />
      {visit.review.status !== "pending" && visit.review.by && (
        <p className="mt-4 text-xs text-muted">
          {visit.review.status === "approved" ? "Approved" : "Rejected"} by {visit.review.by}
        </p>
      )}
      {visit.status === "uploaded" && (
        <div className="mt-4">
          <RefreshWhileAnalysing />
        </div>
      )}
    </>
  );
}
