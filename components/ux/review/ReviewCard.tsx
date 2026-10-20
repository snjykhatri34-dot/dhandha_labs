// Dumb component: one scorecard in the review queue, with Approve / Reject.
import Link from "next/link";
import { reviewVisit } from "@/app/(ux)/manager/review/actions";
import { OutcomeBadge } from "@/components/ux/shared";
import type { Visit } from "@/lib/data/types";
import { formatDate, reasonLabel } from "@/lib/ux/format";

export function ReviewCard({ visit }: { visit: Visit }) {
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">
          {visit.salesperson} <span className="font-normal text-muted">· {visit.store}</span>
        </p>
        <Link href={`/owner/visits/${visit.id}`} className="font-mono text-xs text-muted underline">
          {visit.id}
        </Link>
      </div>
      <p className="text-xs text-muted">{[formatDate(visit.date), visit.startTime].filter(Boolean).join(" · ")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <OutcomeBadge outcome={visit.outcome} />
        {visit.reasonNotBought && <span className="text-muted">{reasonLabel(visit.reasonNotBought)}</span>}
        {visit.handlingScore !== null && <span className="text-muted">· handling {visit.handlingScore}/5</span>}
      </div>
      {visit.coachingTip && <p className="mt-2 text-sm">Coaching: {visit.coachingTip}</p>}
      {visit.flags.length > 0 && (
        <p className="mt-1 text-xs text-warn">
          {visit.flags.length} flag{visit.flags.length > 1 ? "s" : ""} to check on the full scorecard
        </p>
      )}
      <form action={reviewVisit} className="mt-3 flex gap-2">
        <input type="hidden" name="id" value={visit.id} />
        <button name="decision" value="approved" className="flex-1 rounded-lg bg-good px-3 py-2 text-sm font-medium text-paper">
          Approve
        </button>
        <button name="decision" value="rejected" className="flex-1 rounded-lg border border-bad/40 px-3 py-2 text-sm font-medium text-bad">
          Reject
        </button>
      </form>
    </li>
  );
}
