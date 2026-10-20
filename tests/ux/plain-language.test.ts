// Guard: nothing the owner, manager or staff read may contain developer jargon.
import { describe, expect, it } from "vitest";
import { toReportView } from "@/components/ux/report/view";
import { toVisitView } from "@/components/ux/visit/view";
import { buildDailyReport } from "@/lib/data/report";
import { LABELLED_VISITS, PIPELINE_RUN_VISITS, SAMPLE_DAY_DATE, SAMPLE_DAY_VISITS } from "@/lib/data/mock/sources";

const JARGON = [/\b[a-z]+_[a-z_]+\b/, /\bmock\b/i, /\bStream \d\b/, /@\d\d:\d\d/, /\bflags?\b/i, /\bnull\b|\bundefined\b/];

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => (["id", "at", "outcome", "tone"].includes(k) ? [] : strings(v)));
  return [];
}

function jargonIn(texts: string[]) {
  return texts.filter((t) => JARGON.some((re) => re.test(t)));
}

describe("plain language", () => {
  it("scorecards for every sample, labelled and pipeline visit", () => {
    for (const v of [...SAMPLE_DAY_VISITS, ...LABELLED_VISITS, ...PIPELINE_RUN_VISITS]) {
      expect(jargonIn(strings(toVisitView(v))), v.id).toEqual([]);
    }
  });

  it("the daily report", () => {
    const view = toReportView(buildDailyReport(SAMPLE_DAY_DATE, SAMPLE_DAY_VISITS, "2026-10-17T21:00:00+05:30"));
    expect(jargonIn(strings(view))).toEqual([]);
  });
});
