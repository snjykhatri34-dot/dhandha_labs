import { describe, expect, it } from "vitest";
import reference from "@/expected_outputs/daily_report_reference.json";
import { buildDailyReport } from "@/lib/data/report";
import { parseCue, SAMPLE_DAY_DATE, SAMPLE_DAY_VISITS } from "@/lib/data/mock/sources";

describe("mock daily report vs expected_outputs/daily_report_reference.json", () => {
  const report = buildDailyReport(SAMPLE_DAY_DATE, SAMPLE_DAY_VISITS, "2026-10-17T21:00:00+05:30");

  it("matches every number in the reference file", () => {
    expect(report.numbers).toEqual(reference);
  });

  it("finds the B2 light-necklace hotspot and the B3 exchange pattern", () => {
    expect(report.lostDemandHotspot).toEqual({ store: "B2", category: "necklace", weightBand: "20-35", asks: 12, lost: 11 });
    expect(report.storePattern).toEqual({ store: "B3", reason: "old_gold_exchange_rate", count: 5, losses: 14 });
  });

  it("has an action line for every section", () => {
    for (const section of ["headline", "lostSales", "lostDemand", "storePattern", "salespeople", "busiestHours", "followUps"] as const) {
      expect(report.actions[section], section).toBeTruthy();
    }
    expect(report.actions.salespeople).toBe("Akshay: pair with Priya tomorrow.");
    expect(report.actions.storePattern).toBe("Publish one written exchange formula.");
  });

  it("lists 23 follow-ups and 102 sources", () => {
    expect(report.followUpVisitIds).toHaveLength(23);
    expect(report.sourceVisitIds).toHaveLength(102);
  });
});

describe("parseCue", () => {
  it("splits cue type and evidence", () => {
    expect(parseCue("words: 'That's far too heavy'")).toEqual({ cueType: "words", cueEvidence: "'That's far too heavy'" });
    expect(parseCue("face")).toEqual({ cueType: "face", cueEvidence: null });
    expect(parseCue("smell: odd")).toEqual({ cueType: null, cueEvidence: "odd" });
  });
});
