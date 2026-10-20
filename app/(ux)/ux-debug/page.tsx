// Throwaway Phase 1 check: lists every visit from the data layer. Delete once /owner ships.
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { OutcomeBadge, LoadingBlock, ReviewBadge, StatusPill } from "@/components/ux/shared";
import { dataSource, visits } from "@/lib/data";

async function VisitTable() {
  await connection();
  const all = await visits.list();
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        {all.length} visits from <code>DATA_SOURCE={dataSource}</code>
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {all.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <Link href={`/owner/visits/${v.id}`} className="w-20 font-mono hover:underline">
              {v.id}
            </Link>
            <span className="w-24">{v.salesperson}</span>
            <span className="w-24 text-muted">
              {v.date} {v.startTime}
            </span>
            <StatusPill status={v.status} />
            <OutcomeBadge outcome={v.outcome} />
            <ReviewBadge status={v.review.status} />
          </li>
        ))}
      </ul>
    </>
  );
}

export default function UxDebugPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Data layer check</h1>
      <Suspense fallback={<LoadingBlock label="Loading visits…" />}>
        <VisitTable />
      </Suspense>
    </>
  );
}
