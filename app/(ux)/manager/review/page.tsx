import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ReviewCard } from "@/components/ux/review/ReviewCard";
import { canReview, PAY_NOTICE, recentlyReviewed, reviewQueue } from "@/components/ux/review/visibility";
import { EmptyState, LoadingBlock, ReviewBadge } from "@/components/ux/shared";
import { visits } from "@/lib/data";
import { getRole } from "@/lib/ux/role";

async function ReviewQueue() {
  await connection();
  const role = await getRole();
  if (!canReview(role)) {
    return <EmptyState title="Only managers review scorecards">Switch “View as” to Manager to see the queue.</EmptyState>;
  }
  const all = await visits.list();
  const queue = reviewQueue(all);
  const recent = recentlyReviewed(all);
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        {queue.length === 0 ? "Nothing waiting." : `${queue.length} scorecard${queue.length > 1 ? "s" : ""} waiting, oldest first.`}
      </p>
      {queue.length === 0 ? (
        <EmptyState title="All caught up">New scorecards appear here after a clip is analysed.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {queue.map((v) => (
            <ReviewCard key={v.id} visit={v} />
          ))}
        </ul>
      )}
      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold">Recently reviewed</h2>
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {recent.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-3 py-2">
                <Link href={`/owner/visits/${v.id}`} className="font-mono text-xs underline">
                  {v.id}
                </Link>
                <span>{v.salesperson}</span>
                <span className="ml-auto">
                  {v.review.status === "approved" ? <span className="text-xs text-good">Approved</span> : <ReviewBadge status={v.review.status} />}
                </span>
                <span className="text-xs text-muted">by {v.review.by}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function ManagerReviewPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Review scorecards</h1>
      <p className="mt-1 text-sm text-muted">Staff only see a scorecard after a manager approves it.</p>
      <p className="mt-3 mb-5 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">{PAY_NOTICE}</p>
      <Suspense fallback={<LoadingBlock label="Loading the queue…" />}>
        <ReviewQueue />
      </Suspense>
    </>
  );
}
