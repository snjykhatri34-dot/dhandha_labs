import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { reports } from "@/lib/data";
import { formatInr, formatReportSummary } from "@/lib/notify/format";
import type { DailyReportReference } from "@/lib/types/scorecard";

const reference = JSON.parse(readFileSync("expected_outputs/daily_report_reference.json", "utf8")) as DailyReportReference;

const notifyRequest = (body: object) =>
  new NextRequest("http://test/api/ux/notify", { method: "POST", body: JSON.stringify(body) });

describe("formatReportSummary", () => {
  it("matches the reference numbers and links to the report", async () => {
    const report = (await reports.latest())!;
    const text = formatReportSummary(report, "https://demo.example/");
    expect(text).toContain(`${reference.visits} visits, ${reference.bought} sales (${reference.conversion_pct}% conversion)`);
    expect(text).toContain("₹1.19 crore");
    const [reason, count] = [...reference.reasons_not_bought].sort((a, b) => b[1] - a[1])[0];
    expect(reason).toBe("weight_mismatch");
    expect(text).toContain(`Top reason for walkouts: weight mismatch (${count} visits).`);
    expect(text).toMatch(/Today's action: .+/);
    expect(text).toContain(`Full report: https://demo.example/owner/reports/${report.date}`);
  });

  it("formats rupees in crore and lakh", () => {
    expect(formatInr(11926399)).toBe("₹1.19 crore");
    expect(formatInr(1234567)).toBe("₹12.3 lakh");
    expect(formatInr(45000)).toBe("₹45,000");
  });
});

describe("messageContent", () => {
  it("sends free text when no template is set, and template variables when one is", async () => {
    const { messageContent } = await import("@/lib/notify/whatsapp");
    const text = "*Counter Intelligence · Sat 17 Oct*\n102 visits.\nFull report: https://x/owner/reports/2026-10-17";
    expect(messageContent(text, "")).toEqual({ Body: text });
    const t = messageContent(text, "HX123");
    expect(t.ContentSid).toBe("HX123");
    expect(JSON.parse(t.ContentVariables)).toEqual({
      "1": "Counter Intelligence · Sat 17 Oct · 102 visits.",
      "2": "https://x/owner/reports/2026-10-17",
    });
  });
});

describe("metaSender", () => {
  it("posts a text message with digits-only recipient, and explains window errors", async () => {
    vi.stubEnv("META_WHATSAPP_TOKEN", "test-token");
    vi.stubEnv("META_PHONE_NUMBER_ID", "123");
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return calls.length === 1
        ? new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 })
        : new Response(JSON.stringify({ error: { code: 131047, message: "Re-engagement message" } }), { status: 400 });
    });
    const { metaSender, digitsOnly } = await import("@/lib/notify/whatsapp");
    expect(digitsOnly("whatsapp:+1 617-555-0000")).toBe("16175550000");
    await expect(metaSender.sendReport("whatsapp:+16175550000", "hello")).resolves.toEqual({ id: "wamid.1" });
    expect(calls[0].url).toBe("https://graph.facebook.com/v23.0/123/messages");
    expect(calls[0].body).toMatchObject({ messaging_product: "whatsapp", to: "16175550000", type: "text", text: { body: "hello" } });
    await expect(metaSender.sendReport("whatsapp:+16175550000", "hello")).rejects.toThrow(/131047.*Send "hi"/);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

describe("email", () => {
  it("turns the summary into a subject, plain text and HTML with a clickable link", async () => {
    const { toEmail } = await import("@/lib/notify/email");
    const m = toEmail("*Counter Intelligence · Sat 17 Oct*\n102 visits <b>\nFull report: https://x/owner/reports/2026-10-17");
    expect(m.subject).toBe("Counter Intelligence · Sat 17 Oct");
    expect(m.text).not.toContain("*");
    expect(m.html).toContain('<a href="https://x/owner/reports/2026-10-17">');
    expect(m.html).toContain("&lt;b&gt;");
  });

  it("sends through Gmail SMTP with the app password, spaces removed", async () => {
    vi.resetModules();
    const sent: Record<string, unknown>[] = [];
    const created: Record<string, unknown>[] = [];
    vi.doMock("nodemailer", () => ({
      default: {
        createTransport: (opts: Record<string, unknown>) => {
          created.push(opts);
          return { sendMail: async (m: Record<string, unknown>) => (sent.push(m), { messageId: "<m1>" }) };
        },
      },
    }));
    vi.stubEnv("GMAIL_USER", "me@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
    const { gmailSender } = await import("@/lib/notify/email");
    await expect(gmailSender.sendReport("owner@example.com", "*Title*\nLine")).resolves.toEqual({ id: "<m1>" });
    expect(created[0]).toMatchObject({ host: "smtp.gmail.com", port: 465, auth: { user: "me@gmail.com", pass: "abcdefghijklmnop" } });
    expect(sent[0]).toMatchObject({ to: "owner@example.com", subject: "Title", from: "Counter Intelligence <me@gmail.com>" });
    vi.doUnmock("nodemailer");
    vi.unstubAllEnvs();
  });
});

describe("POST /api/ux/notify", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("OWNER_WHATSAPP_TO", "whatsapp:+15550000000");
    vi.stubEnv("OWNER_EMAIL_TO", "owner@example.com");
    delete (globalThis as { __uxNotifications?: unknown }).__uxNotifications;
  });

  it("sends once, and a second click sends nothing", async () => {
    vi.stubEnv("NOTIFY_DRY_RUN", "1");
    const { POST } = await import("@/app/api/ux/notify/route");
    const first = await (await POST(notifyRequest({}))).json();
    expect(first).toMatchObject({ ok: true, result: "sent", channel: "email", row: { status: "sent", channel: "email" } });
    expect(first.row.sent_at).toBeTruthy();

    const second = await (await POST(notifyRequest({ reportId: first.reportId }))).json();
    expect(second).toMatchObject({ ok: true, result: "already_sent", reportId: first.reportId });
  });

  it("uses WhatsApp when NOTIFY_CHANNEL=whatsapp", async () => {
    vi.stubEnv("NOTIFY_DRY_RUN", "1");
    vi.stubEnv("NOTIFY_CHANNEL", "whatsapp");
    const { POST } = await import("@/app/api/ux/notify/route");
    const body = await (await POST(notifyRequest({}))).json();
    expect(body).toMatchObject({ result: "sent", channel: "whatsapp", row: { channel: "whatsapp" } });
  });

  it("logs a failure, returns 200, and allows a retry", async () => {
    vi.stubEnv("NOTIFY_DRY_RUN", "0");
    vi.stubEnv("GMAIL_USER", ""); // makes the Gmail sender fail before any network call
    const { POST } = await import("@/app/api/ux/notify/route");
    const res = await POST(notifyRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, result: "failed", row: { status: "failed" } });
    expect(body.row.error).toMatch(/GMAIL_USER/);

    // Retry after fixing the cause: a failed row doesn't block the next attempt.
    vi.resetModules();
    vi.stubEnv("NOTIFY_DRY_RUN", "1");
    const retry = await import("@/app/api/ux/notify/route");
    const again = await (await retry.POST(notifyRequest({ reportId: body.reportId }))).json();
    expect(again.result).toBe("sent");
  });

  it("returns 404 for an unknown report", async () => {
    vi.stubEnv("NOTIFY_DRY_RUN", "1");
    const { POST } = await import("@/app/api/ux/notify/route");
    expect((await POST(notifyRequest({ reportId: "nope" }))).status).toBe(404);
  });
});
