import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetVisitMessages, seedVisitMessage } from "@/lib/notify/visit-messages";

const post = async (body: object) => {
  const { POST } = await import("@/app/api/ux/notify/visit/route");
  const res = await POST(new NextRequest("http://test/api/ux/notify/visit", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

describe("POST /api/ux/notify/visit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    resetVisitMessages();
    vi.stubEnv("OWNER_EMAIL_TO", "owner@example.com");
    seedVisitMessage("B2-1020", "*B2-1020 · Akshay (B2) · 21 Oct: walked out*\n• Handling: 2/5");
  });

  it("refuses a bad id and a visit with no message", async () => {
    expect((await post({ visitId: "nope" })).status).toBe(400);
    expect((await post({ visitId: "B2-9999" })).status).toBe(404);
  });

  it("a dry run doesn't count as sent, so the real send still goes, once", async () => {
    vi.stubEnv("NOTIFY_DRY_RUN", "1");
    expect((await post({ visitId: "B2-1020" })).body.result).toBe("dry_run");
    expect((await post({ visitId: "B2-1020" })).body.result).toBe("dry_run");

    vi.resetModules();
    vi.stubEnv("NOTIFY_DRY_RUN", "0");
    vi.stubEnv("GMAIL_USER", "me@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "x");
    const sendMail = vi.fn(async () => ({ messageId: "m1" }));
    vi.doMock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));
    expect((await post({ visitId: "B2-1020" })).body.result).toBe("sent");
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.com", subject: "B2-1020 · Akshay (B2) · 21 Oct: walked out" }));
    expect((await post({ visitId: "B2-1020" })).body.result).toBe("already_sent");
    expect(sendMail).toHaveBeenCalledTimes(1);
    vi.doUnmock("nodemailer");
  });

  it("a failed send is released so it can be retried", async () => {
    vi.stubEnv("NOTIFY_DRY_RUN", "0");
    vi.stubEnv("GMAIL_USER", ""); // the Gmail sender fails before any network call
    const failed = await post({ visitId: "B2-1020" });
    expect(failed.body.result).toBe("failed");
    expect(failed.body.error).toMatch(/GMAIL_USER/);
    vi.resetModules();
    vi.stubEnv("NOTIFY_DRY_RUN", "1");
    expect((await post({ visitId: "B2-1020" })).body.result).toBe("dry_run");
  });
});
