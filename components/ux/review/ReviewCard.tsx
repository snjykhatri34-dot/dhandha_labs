// Dumb component: one scorecard in the review queue, with Approve / Reject.
import Link from "next/link";
import { OutcomeBadge } from "@/components/ux/shared";
import { ReviewButtons } from "./ReviewButtons";
import type { Visit } from "@/lib/data/types";
import { formatDate, reasonLabel } from "@/lib/ux/format";
import { handlingWord, plainNote } from "@/lib/ux/plain";

export function ReviewCard({ visit }: { visit: Visit }) {
  const notes = visit.flags.filter((f) => plainNote(f) !== null).length;
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
        {visit.handlingScore !== null && <span className="text-muted">· Handled: {handlingWord(visit.handlingScore).toLowerCase()} ({visit.handlingScore}/5)</span>}
      </div>
      {visit.coachingTip && <p className="mt-2 text-sm">Coaching tip: {visit.coachingTip}</p>}
      {notes > 0 && (
        <p className="mt-1 text-xs text-warn">
          {notes} point{notes > 1 ? "s" : ""} to double-check: open the scorecard
        </p>
      )}
      <div className="mt-3">
        <ReviewButtons id={visit.id} />
      </div>
    </li>
  );
}
