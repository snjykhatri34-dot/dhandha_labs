// The Supabase clip store and notification log, against a fake fetch (no network).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[];
let reply: (c: Call) => Response;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const c: Call = {
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(c);
    return reply(c);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
const REPORT = "5b0d7c7e-2f1a-4c3b-9d4e-0a1b2c3d4e5f";

describe("supabaseClipStore", () => {
  it("signs a one-time upload URL in the recordings bucket", async () => {
    reply = () => ok({ url: "/object/upload/sign/recordings/B2/2026-10-20/B2_Priya_2026-10-20_x.mp4?token=t1" });
    const { supabaseClipStore } = await import("@/lib/storage/supabase");
    const t = await supabaseClipStore.createUpload({
      store: "B2", salesperson: "Priya", date: "2026-10-20", fileName: "a.mp4", contentType: "video/mp4",
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toMatch(/^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/upload\/sign\/recordings\/B2\/2026-10-20\/B2_Priya_2026-10-20_.+\.mp4$/);
    expect(calls[0].headers.Authorization).toBe("Bearer service-key");
    expect(t).toMatchObject({
      method: "PUT",
      url: "https://proj.supabase.co/storage/v1/object/upload/sign/recordings/B2/2026-10-20/B2_Priya_2026-10-20_x.mp4?token=t1",
      headers: { "Content-Type": "video/mp4" },
    });
    expect(t.path).toMatch(/^B2\/2026-10-20\/B2_Priya_2026-10-20_.+\.mp4$/);
  });

  it("checks the clip exists by listing its folder", async () => {
    reply = () => ok([{ name: "B2_Priya_2026-10-20_x.mp4" }]);
    const { supabaseClipStore } = await import("@/lib/storage/supabase");
    expect(await supabaseClipStore.exists("B2/2026-10-20/B2_Priya_2026-10-20_x.mp4")).toBe(true);
    expect(calls[0].url).toBe("https://proj.supabase.co/storage/v1/object/list/recordings");
    expect(calls[0].body).toMatchObject({ prefix: "B2/2026-10-20", search: "B2_Priya_2026-10-20_x.mp4" });
    reply = () => ok([]);
    expect(await supabaseClipStore.exists("B2/2026-10-20/missing.mp4")).toBe(false);
  });
});

describe("supabaseNotificationLog", () => {
  it("inserts first and returns null when the report was already claimed", async () => {
    const { supabaseNotificationLog: log } = await import("@/lib/notify/log");
    reply = () => ok([{ report_id: REPORT, channel: "email", status: "pending", sent_at: null, error: null }]);
    expect(await log.claim(REPORT, "email")).toMatchObject({ status: "pending" });
    expect(calls[0].url).toContain("/rest/v1/ux_notifications?on_conflict=report_id");
    expect(calls[0].headers.Prefer).toBe("resolution=ignore-duplicates,return=representation");
    expect(calls[0].body).toEqual({ report_id: REPORT, channel: "email", status: "pending" });

    reply = () => ok([]);
    expect(await log.claim(REPORT, "email")).toBeNull();
  });

  it("updates and reads by report_id", async () => {
    const { supabaseNotificationLog: log } = await import("@/lib/notify/log");
    reply = () => new Response(null, { status: 204 });
    await log.update(REPORT, { status: "sent", sent_at: "2026-10-20T21:00:00Z" });
    expect(calls[0]).toMatchObject({ method: "PATCH", body: { status: "sent", sent_at: "2026-10-20T21:00:00Z" } });
    expect(calls[0].url).toContain(`ux_notifications?report_id=eq.${REPORT}`);
  });

  it("explains, without calling Supabase, when the report isn't saved in daily_reports", async () => {
    const { supabaseNotificationLog: log } = await import("@/lib/notify/log");
    await expect(log.claim("computed-2026-10-20-all", "email")).rejects.toThrow(/isn't saved in daily_reports/);
    expect(calls).toHaveLength(0);
  });
});
