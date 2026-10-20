// Dumb component: a list of visits linking to their scorecards.
import Link from "next/link";
import { EmptyState, OutcomeBadge, ReviewBadge, StatusPill } from "@/components/ux/shared";
import type { Visit } from "@/lib/data/types";
import { reasonLabel } from "@/lib/ux/format";
import { handlingWord } from "@/lib/ux/plain";

export function VisitList({ visits }: { visits: Visit[] }) {
  if (visits.length === 0) return <EmptyState title="No visits match these filters" />;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {visits.map((v) => (
        <li key={v.id}>
          <Link href={`/owner/visits/${v.id}`} className="flex flex-col gap-1 px-3 py-2.5 hover:bg-line/40">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-medium">
                {v.salesperson} <span className="font-normal text-muted">· {v.store}</span>
              </span>
              <span className="text-xs text-muted tabular-nums">
                {v.date.slice(5)} {v.startTime}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs">
              {v.status !== "analysed" ? <StatusPill status={v.status} /> : <OutcomeBadge outcome={v.outcome} />}
              {v.reasonNotBought && <span className="text-muted">{reasonLabel(v.reasonNotBought)}</span>}
              {v.handlingScore !== null && <span className="text-muted">· Handled: {handlingWord(v.handlingScore).toLowerCase()}</span>}
              <ReviewBadge status={v.review.status} />
              <span className="ml-auto font-mono text-muted">{v.id}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
