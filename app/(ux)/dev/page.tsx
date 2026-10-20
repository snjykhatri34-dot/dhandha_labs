// /dev: demo controls (Person A). Not linked from the nav.
import { Suspense } from "react";
import { connection } from "next/server";
import { NotifyButton } from "@/components/ux/dev/NotifyButton";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ux/shared";
import { dataSource, reports, type DailyReport } from "@/lib/data";
import { formatReportSummary } from "@/lib/notify/format";
import { provider } from "@/lib/notify/whatsapp";

function maskNumber(to: string | undefined) {
  if (!to) return "not set";
  const digits = to.replace(/\D/g, "");
  return `+${digits.slice(0, 2)}…${digits.slice(-2)}`;
}

async function NotifyPanel() {
  await connection();
  let report: DailyReport | null;
  try {
    report = await reports.latest();
  } catch (e) {
    return <ErrorState title="Couldn't load the latest report" message={e instanceof Error ? e.message : String(e)} />;
  }
  if (!report) return <EmptyState title="No report yet">Stream 2 creates one at closing time.</EmptyState>;

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const local = /localhost|127\.0\.0\.1/.test(baseUrl);
  return (
    <div className="grid gap-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Report</dt>
        <dd>
          {report.date} <code className="text-xs">{report.id}</code>
        </dd>
        <dt className="text-muted">Send to</dt>
        <dd>{maskNumber(process.env.OWNER_WHATSAPP_TO)}</dd>
        <dt className="text-muted">Mode</dt>
        <dd>
          DATA_SOURCE={dataSource} · WHATSAPP_PROVIDER={provider} · NOTIFY_TRIGGER={process.env.NOTIFY_TRIGGER ?? "report_ready"}
          {process.env.NOTIFY_DRY_RUN === "1" && " · dry run (nothing is sent)"}
        </dd>
      </dl>

      {local && (
        <p className="rounded-lg bg-warn-bg p-3 text-sm text-warn">
          APP_BASE_URL is {baseUrl}, so the link in the message only opens on this laptop. Use the deployed URL or an
          ngrok tunnel for the demo phone.
        </p>
      )}

      <div>
        <p className="mb-1 text-sm font-medium">Message preview</p>
        <pre className="whitespace-pre-wrap rounded-lg border border-line p-3 text-sm">{formatReportSummary(report, baseUrl)}</pre>
      </div>

      <NotifyButton reportId={report.id} />
    </div>
  );
}

export default function DevPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Demo controls</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Sends today&apos;s report summary to the owner&apos;s WhatsApp. One report is sent once; a second click sends nothing.
      </p>
      <Suspense fallback={<LoadingBlock label="Loading the report…" />}>
        <NotifyPanel />
      </Suspense>
    </>
  );
}
