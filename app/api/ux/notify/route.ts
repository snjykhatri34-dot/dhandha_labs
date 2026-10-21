// POST /api/ux/notify { reportId?, date? }: send the daily report summary to the owner
// by email (Gmail, default) or WhatsApp, chosen by NOTIFY_CHANNEL.
// Insert first, send second: a report that was sent is never sent again. A failed send can be retried.
// If sending fails we log it and still return 200: the report itself is fine.
import { NextResponse, type NextRequest } from "next/server";
import { reports, type DailyReport } from "@/lib/data";
import { formatReportSummary } from "@/lib/notify/format";
import { notificationLog, type NotificationRow } from "@/lib/notify/log";
import { channel, notifier, recipient, recipientEnvName } from "@/lib/notify";

export type NotifyResponse =
  | {
      ok: true;
      result: "sent" | "already_sent" | "failed";
      channel: "email" | "whatsapp";
      reportId: string;
      row: NotificationRow | null;
      text?: string;
    }
  | { ok: false; error: string };

async function findReport(reportId?: string, date?: string): Promise<DailyReport | null> {
  if (date) return reports.getByDate(date);
  if (!reportId) return reports.latest();
  for (const d of await reports.dates()) {
    const r = await reports.getByDate(d);
    if (r?.id === reportId) return r;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { reportId?: string; date?: string };
  const to = recipient();
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  if (!to) return NextResponse.json<NotifyResponse>({ ok: false, error: `${recipientEnvName()} is not set in .env.local` }, { status: 500 });

  let report: DailyReport | null;
  try {
    report = await findReport(body.reportId, body.date);
  } catch (e) {
    return NextResponse.json<NotifyResponse>({ ok: false, error: `Couldn't load the report: ${message(e)}` }, { status: 500 });
  }
  if (!report) return NextResponse.json<NotifyResponse>({ ok: false, error: "No report found." }, { status: 404 });

  // 1. Insert the row first. If it already exists and wasn't a failure, don't send again.
  // A dry run only blocks another dry run, so testing never stops the owner's real message.
  const dryRun = process.env.NOTIFY_DRY_RUN === "1";
  let row: NotificationRow | null;
  try {
    row = await notificationLog.claim(report.id, channel);
    if (!row) {
      const existing = await notificationLog.get(report.id);
      if (existing && existing.status !== "failed" && !(existing.status === "dry_run" && !dryRun)) {
        console.info("[notify] skip, already", existing.status, report.id);
        return NextResponse.json<NotifyResponse>({ ok: true, result: "already_sent", channel, reportId: report.id, row: existing });
      }
      await notificationLog.update(report.id, { status: "pending", error: null });
      row = await notificationLog.get(report.id);
    }
  } catch (e) {
    console.error("[notify] couldn't record the notification", { reportId: report.id, error: message(e) });
    return NextResponse.json<NotifyResponse>({ ok: false, error: `Nothing was sent: ${message(e)}` }, { status: 409 });
  }

  // 2. Send. 3. Update the row. 4. Log the attempt.
  const text = formatReportSummary(report, baseUrl);
  try {
    const { id } = await notifier.sendReport(to, text);
    await notificationLog.update(report.id, dryRun ? { status: "dry_run", error: null } : { status: "sent", sent_at: new Date().toISOString(), error: null });
    console.info("[notify] sent", { channel, reportId: report.id, messageId: id });
    return NextResponse.json<NotifyResponse>({
      ok: true,
      result: "sent",
      channel,
      reportId: report.id,
      row: await notificationLog.get(report.id),
      text,
    });
  } catch (e) {
    // 5. Sending failed: log it, keep the row as failed, don't fail the report.
    await notificationLog.update(report.id, { status: "failed", error: message(e) });
    console.error("[notify] failed", { channel, reportId: report.id, error: message(e) });
    return NextResponse.json<NotifyResponse>({
      ok: true,
      result: "failed",
      channel,
      reportId: report.id,
      row: await notificationLog.get(report.id),
      text,
    });
  }
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
