// POST /api/ux/notify/visit { visitId }: email (or WhatsApp) the owner one analysed visit's scorecard text,
// as soon as the pipeline has scored it. The text is the pipeline's own (visit_messages, pipeline/message.py).
// Claim first, send second: a visit is sent at most once. A failed send is released so it can be retried,
// and a dry run is released too, so testing never blocks the owner's real email.
import { NextResponse, type NextRequest } from "next/server";
import { channel, notifier, recipient, recipientEnvName } from "@/lib/notify";
import { visitMessages } from "@/lib/notify/visit-messages";

export type NotifyVisitResponse =
  | { ok: true; result: "sent" | "dry_run" | "already_sent" | "failed"; channel: "email" | "whatsapp"; visitId: string; error?: string }
  | { ok: false; error: string };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { visitId?: string };
  const visitId = String(body.visitId ?? "").trim();
  if (!/^B\d-\d+$/.test(visitId)) return reply(400, { ok: false, error: "Give a visit id like B2-1020." });
  const to = recipient();
  if (!to) return reply(500, { ok: false, error: `${recipientEnvName()} is not set` });

  let row;
  try {
    row = await visitMessages.get(visitId);
    if (!row) return reply(404, { ok: false, error: `No owner message for ${visitId} yet (is it analysed?).` });
    if (row.sent_at) return reply(200, { ok: true, result: "already_sent", channel, visitId });
    row = await visitMessages.claim(visitId);
    if (!row) return reply(200, { ok: true, result: "already_sent", channel, visitId });
  } catch (e) {
    console.error("[notify/visit] couldn't claim", { visitId, error: message(e) });
    return reply(500, { ok: false, error: `Nothing was sent: ${message(e)}` });
  }

  const dryRun = process.env.NOTIFY_DRY_RUN === "1";
  try {
    const { id } = await notifier.sendReport(to, row.body);
    if (dryRun) await visitMessages.release(visitId);
    console.info("[notify/visit] sent", { channel, visitId, messageId: id, dryRun });
    return reply(200, { ok: true, result: dryRun ? "dry_run" : "sent", channel, visitId });
  } catch (e) {
    await visitMessages.release(visitId).catch(() => {});
    console.error("[notify/visit] failed", { channel, visitId, error: message(e) });
    return reply(200, { ok: true, result: "failed", channel, visitId, error: message(e) });
  }
}

function reply(status: number, body: NotifyVisitResponse) {
  return NextResponse.json<NotifyVisitResponse>(body, { status });
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
