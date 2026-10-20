import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PAY_NOTICE } from "@/components/ux/review/visibility";
import { EmptyState, LoadingBlock, OutcomeBadge } from "@/components/ux/shared";
import { visits } from "@/lib/data";
import { formatDate, reasonLabel } from "@/lib/ux/format";

async function StaffScorecards({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const sp = await searchParams;
  const me = typeof sp.salesperson === "string" ? sp.salesperson : "";
  // Staff only ever get approved scorecards from the repo.
  const approved = await visits.list({ review: "approved", status: "analysed" });
  const names = [...new Set(approved.map((v) => v.salesperson))].sort();
  const mine = me ? approved.filter((v) => v.salesperson === me) : [];
  const coached = mine.filter((v) => v.coachingTip);

  return (
    <>
      <form method="get" className="mb-5 flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-0.5 text-xs text-muted">
          Your name
          <select name="salesperson" defaultValue={me} className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm text-ink">
            <option value="">Choose…</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-lg bg-ink px-3 py-1.5 text-sm text-paper">Show</button>
      </form>

      {!me ? (
        <EmptyState title="Choose your name">You&apos;ll see your approved scorecards and coaching notes.</EmptyState>
      ) : mine.length === 0 ? (
        <EmptyState title={`No approved scorecards for ${me} yet`}>They appear here once a manager approves them.</EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {mine.length} approved scorecard{mine.length > 1 ? "s" : ""}
            {coached.length > 0 && ` · ${coached.length} with a coaching note`}
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {[...coached, ...mine.filter((v) => !v.coachingTip)].map((v) => (
              <li key={v.id}>
                <Link href={`/staff/visits/${v.id}`} className="block px-3 py-2.5 hover:bg-line/40">
                  <span className="flex items-baseline justify-between gap-2 text-xs text-muted">
                    <span>{[formatDate(v.date), v.startTime].filter(Boolean).join(" · ")}</span>
                    <span className="font-mono">{v.id}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <OutcomeBadge outcome={v.outcome} />
                    {v.reasonNotBought && <span className="text-muted">{reasonLabel(v.reasonNotBought)}</span>}
                  </span>
                  {v.coachingTip && <span className="mt-1 block text-sm">{v.coachingTip}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export default function StaffPage(props: PageProps<"/staff">) {
  return (
    <>
      <h1 className="text-xl font-semibold">My scorecards</h1>
      <p className="mt-1 text-sm text-muted">Coaching notes from your counter visits, after your manager has reviewed them.</p>
      <p className="mt-3 mb-5 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">{PAY_NOTICE}</p>
      <Suspense fallback={<LoadingBlock label="Loading…" />}>
        <StaffScorecards searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
