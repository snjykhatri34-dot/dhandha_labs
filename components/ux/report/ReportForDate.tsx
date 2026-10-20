// Server component: loads a report through lib/data and renders it. Wrap in <Suspense>.
import { connection } from "next/server";
import { EmptyState } from "@/components/ux/shared";
import { reports } from "@/lib/data";
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
  return <DailyReportView view={toReportView(report)} sourceCount={report.sourceVisitIds.length} />;
}
