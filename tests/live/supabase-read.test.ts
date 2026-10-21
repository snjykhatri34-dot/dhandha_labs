// READ-ONLY check of the Supabase data layer against the live project. Never writes.
// Run with: npm run test:live   (needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local)
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import reference from "@/expected_outputs/daily_report_reference.json";
import type { DataLayer } from "@/lib/data/types";

let db: DataLayer;

beforeAll(async () => {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  db = (await import("@/lib/data/supabase")).supabaseDataLayer;
});

describe("Supabase data layer (live, read-only)", () => {
  it("lists visits and maps every row", async () => {
    const all = await db.visits.list();
    console.info(`[live] ${all.length} visits; statuses`, Object.groupBy(all, (v) => v.status));
    expect(all.length).toBeGreaterThan(0);
    for (const v of all) {
      expect(v.date, v.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (v.status === "analysed") expect(v.outcome, v.id).not.toBeNull();
    }
  });

  it("gets one visit with its full scorecard", async () => {
    const v = await db.visits.get("B2-1014");
    expect(v?.salesperson).toBe("Akshay");
    expect(v?.coachingTip).toBeTruthy();
  });

  it("the 17 Oct report on real data matches the reference", async () => {
    const report = (await db.reports.getByDate("2026-10-17"))!;
    console.info(`[live] 17 Oct report source: ${report.source}`);
    // Stream 2 swapped the three demo-specific keys for general ones (lost_demand, store_pattern);
    // every other number must match exactly.
    const { b2_light_necklace_asks, b2_light_necklace_lost, b3_exchange_share_of_losses, ...shared } = reference;
    for (const [key, value] of Object.entries(shared)) {
      expect(report.numbers[key as keyof typeof shared], key).toEqual(value);
    }
    // The demo-specific numbers, from the app's own reading of the visits.
    expect(report.lostDemandHotspot).toMatchObject({
      store: "B2",
      asks: b2_light_necklace_asks,
      lost: b2_light_necklace_lost,
    });
    const p = report.storePattern!;
    expect(`${p.store} ${p.count}/${p.losses}`).toBe(`B3 ${b3_exchange_share_of_losses}`);
  });

  it("uses Stream 2's action lines when the report is saved", async () => {
    const report = (await db.reports.getByDate("2026-10-17"))!;
    if (report.source !== "stream2") return;
    for (const section of ["headline", "lostSales", "lostDemand", "storePattern", "salespeople", "busiestHours", "followUps"] as const) {
      expect(report.actions[section], section).toBeTruthy();
    }
    console.info("[live] headline action:", report.actions.headline);
  });

  it("the saved report reads in plain language", async () => {
    const { toReportView } = await import("@/components/ux/report/view");
    const view = toReportView((await db.reports.getByDate("2026-10-17"))!);
    const texts = [view.headline, view.topAction, ...view.sections.flatMap((s) => [s.summary, s.action])].filter(Boolean) as string[];
    expect(texts.filter((s) => /\b[a-z]+_[a-z_]+\b|@\d\d:\d\d|\bStream \d\b/.test(s))).toEqual([]);
  });

  it("every real scorecard reads in plain language", async () => {
    const { toVisitView } = await import("@/components/ux/visit/view");
    const jargon = [/\b[a-z]+_[a-z_]+\b/, /\bmock\b/i, /\bStream \d\b/, /@\d\d:\d\d/];
    const text = (x: unknown): string[] =>
      typeof x === "string" ? [x] : Array.isArray(x) ? x.flatMap(text) : x && typeof x === "object"
        ? Object.entries(x).flatMap(([k, v]) => (["id", "at", "outcome", "tone"].includes(k) ? [] : text(v))) : [];
    const bad = (await db.visits.list()).flatMap((v) =>
      text(toVisitView(v)).filter((s) => jargon.some((re) => re.test(s))).map((s) => `${v.id}: ${s}`),
    );
    expect(bad).toEqual([]);
  });

  it("lists report dates newest first", async () => {
    const dates = await db.reports.dates();
    console.info("[live] report dates", dates);
    expect(dates).toContain("2026-10-17");
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
