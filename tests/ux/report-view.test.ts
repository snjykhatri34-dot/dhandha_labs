import { describe, expect, it } from "vitest";
import reference from "@/expected_outputs/daily_report_reference.json";
import { toReportView } from "@/components/ux/report/view";
import { buildDailyReport } from "@/lib/data/report";
import { SAMPLE_DAY_DATE, SAMPLE_DAY_VISITS } from "@/lib/data/mock/sources";
import { reasonLabel } from "@/lib/ux/format";

const view = toReportView(buildDailyReport(SAMPLE_DAY_DATE, SAMPLE_DAY_VISITS, "2026-10-17T21:00:00+05:30"));
const section = (key: string) => view.sections.find((s) => s.key === key)!;

describe("owner report view shows the reference numbers", () => {
  it("headline and KPI tiles", () => {
    expect(view.headline).toBe(
      "102 customers came to the counter and 42 bought (41%), worth about ₹1.19 crore. The most common reason for not buying: weight mismatch (16 visits).",
    );
    expect(view.topAction).toBe("Fix weight mismatch first (16 visits).");
    expect(view.kpis.map((k) => k.value)).toEqual(["102", "41%", "₹1.19 crore"]);
    expect(view.title).toBe("Daily report · Sat 17 Oct 2026 · all stores");
  });

  it("lost sales rows", () => {
    expect(section("lostSales").rows!.map((r) => [r.label, r.value])).toEqual(
      reference.reasons_not_bought.map(([reason, n]) => [reasonLabel(String(reason)), String(n)]),
    );
    expect(section("lostSales").summary).toBe("60 customers didn't buy. 7 mentioned another shop.");
  });

  it("lost demand and store pattern", () => {
    expect(section("lostDemand").summary).toBe("At store B2, 12 customers asked for 20–35 g necklaces and 11 left without buying.");
    expect(section("storePattern").summary).toBe("At store B3, 5 of 14 lost sales were about the old-gold exchange rate.");
    expect(section("storePattern").rows!.map((r) => r.value)).toEqual(
      Object.values(reference.by_store).map(([b, v]) => `${b} of ${v} bought`),
    );
  });

  it("salespeople, hours and follow-ups", () => {
    expect(section("salespeople").rows!.map((r) => `${r.label} ${r.value}`)).toEqual(
      reference.by_salesperson.map(([name, b, v]) => `${name} ${b} of ${v}`),
    );
    expect(section("busiestHours").rows!.map((r) => `${r.label} ${r.value}`)).toEqual([
      "7 PM 21 visits",
      "6 PM 18 visits",
      "5 PM 17 visits",
    ]);
    expect(section("followUps").visitIds).toHaveLength(reference.follow_ups_due);
  });

  it("every section ends in an action", () => {
    for (const s of view.sections) expect(s.action, s.key).toBeTruthy();
  });
});
