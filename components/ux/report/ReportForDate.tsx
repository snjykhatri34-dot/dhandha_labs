// Server component: loads a report through lib/data and renders it. Wrap in <Suspense>.
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState } from "@/components/ux/shared";
import { reports } from "@/lib/data";
import { formatDate } from "@/lib/ux/format";
import { DailyReportView } from "./DailyReportView";
import { toReportView } from "./view";

export async function ReportForDate({ date }: { date: string | Promise<string> | "latest" }) {
  await connection();
  const d = await date;
  const report = d === "latest" ? await reports.latest() : await reports.getByDate(d);
  if (!report) {
    return (
      <EmptyState title="No report yet">
        {d === "latest" ? "The first report appears after closing." : `There is no report for ${d}.`}
      </EmptyState>
    );
  }
  const otherDates = (await reports.dates()).filter((x) => x !== report.date).slice(0, 7);
  return (
    <>
      {report.source === "computed" && (
        <p className="mb-3 rounded-lg border border-line px-3 py-2 text-xs text-muted">
          Worked out from this day&apos;s {report.sourceVisitIds.length} visits. The full written report hasn&apos;t
          arrived yet, so the suggested actions are short ones.
        </p>
      )}
      <DailyReportView view={toReportView(report)} sourceCount={report.sourceVisitIds.length} />
      {otherDates.length > 0 && (
        <nav className="mt-4 flex flex-wrap items-center gap-2 text-sm" aria-label="Other reports">
          <span className="text-muted">Other days:</span>
          {otherDates.map((x) => (
            <Link key={x} href={`/owner/reports/${x}`} className="rounded-full border border-line px-2.5 py-0.5 hover:border-ink">
              {formatDate(x)}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
