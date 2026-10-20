import { describe, expect, it } from "vitest";
import reference from "@/expected_outputs/daily_report_reference.json";
import { toReportView } from "@/components/ux/report/view";
import { buildDailyReport } from "@/lib/data/mock/report";
import { SAMPLE_DAY_DATE, SAMPLE_DAY_VISITS } from "@/lib/data/mock/sources";
import { reasonLabel } from "@/lib/ux/format";

const view = toReportView(buildDailyReport(SAMPLE_DAY_DATE, SAMPLE_DAY_VISITS, "2026-10-17T21:00:00+05:30"));
const section = (key: string) => view.sections.find((s) => s.key === key)!;

describe("owner report view shows the reference numbers", () => {
  it("headline and KPI tiles", () => {
    expect(view.headline).toBe(
      "102 counter visits, 42 sales (41%), ≈₹1.19 crore. The biggest leak is weight mismatch: 16 visits.",
    );
    expect(view.kpis.map((k) => k.value)).toEqual(["102", "41%", "₹1.19 crore"]);
    expect(view.title).toBe("Daily report · Sat 17 Oct 2026 · all stores");
  });

  it("lost sales rows", () => {
    expect(section("lostSales").rows!.map((r) => [r.label, r.value])).toEqual(
      reference.reasons_not_bought.map(([reason, n]) => [reasonLabel(String(reason)), String(n)]),
    );
    expect(section("lostSales").summary).toBe("60 visits did not buy. 7 mentioned a competitor.");
  });

  it("lost demand and store pattern", () => {
    expect(section("lostDemand").summary).toBe("B2 had 12 asks for 20-35 g necklaces and lost 11.");
    expect(section("storePattern").summary).toBe("At B3, 5 of 14 losses were about old-gold exchange rate.");
    expect(section("storePattern").rows!.map((r) => r.value)).toEqual(
      Object.values(reference.by_store).map(([b, v]) => `${b}/${v}`),
    );
  });

  it("salespeople, hours and follow-ups", () => {
    expect(section("salespeople").rows!.map((r) => `${r.label} ${r.value}`)).toEqual(
      reference.by_salesperson.map(([name, b, v]) => `${name} ${b}/${v}`),
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
