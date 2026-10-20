import { describe, expect, it } from "vitest";
import { rowToVisit, storeLocal, type VisitDbRow } from "@/lib/data/supabase/mapping";

// Shapes copied from the live `visits` table (synthetic data).
const sampleRow: VisitDbRow = {
  id: "B1-1001",
  store: "B1",
  salesperson: "Harish",
  recorded_at: "2026-10-17T13:40:00+00:00",
  media_path: null,
  status: "analysed",
  created_at: "2026-10-20T16:00:00+00:00",
  analysis: {
    date: "2026-10-17",
    start: "19:10",
    duration_min: 8,
    store: "B1",
    outcome: "bought",
    asked_for: { category: "necklace", weight_band: "20-35" },
    shown: ["necklace 22 g"],
    reason_not_bought: null,
    competitor_mentioned: false,
    emotion_arc: "curious -> delighted",
    emotions: [{ at: "00:08", cue: "words", who: "customer", emotion: "curious" }],
    customer: { party: "solo", intent: "high", decision_maker: "the customer", intent_evidence: "00:08 asked for 20-35 g" },
    handling_score: 4,
    lost_demand: false,
    value_inr: 101932,
    flags: ["chosen piece called twenty-four grams at 00:28"],
  },
};

describe("Supabase row mapping", () => {
  it("maps an analysed sample-day row, keeping the store's local time", () => {
    const v = rowToVisit(sampleRow);
    expect(v).toMatchObject({
      id: "B1-1001",
      date: "2026-10-17",
      startTime: "19:10",
      durationMin: 8,
      outcome: "bought",
      valueInr: 101932,
      emotionArc: "curious -> delighted",
      competitorMentioned: false,
      review: { status: "pending" },
    });
    expect(v.emotions[0]).toMatchObject({ emotion: "curious", cueType: "words", cueEvidence: null });
    expect(v.customer?.intent).toBe("high");
  });

  it("an uploaded row has no analysis and takes date/time from recorded_at in IST", () => {
    const v = rowToVisit({
      ...sampleRow,
      id: "B2-1103",
      store: "B2",
      recorded_at: "2026-10-20T12:35:00+00:00", // 18:05 IST
      media_path: "B2/2026-10-20/B2_Akshay_2026-10-20_x.mp4",
      status: "uploaded",
      analysis: null,
    });
    expect(v).toMatchObject({ date: "2026-10-20", startTime: "18:05", status: "uploaded", outcome: null, error: null });
    expect(v.keyMoments).toEqual([]);
  });

  it("a failed row shows an error and no scorecard", () => {
    const v = rowToVisit({ ...sampleRow, status: "failed" });
    expect(v.outcome).toBeNull();
    expect(v.error).toMatch(/failed/i);
  });

  it("uses the review row when there is one", () => {
    const v = rowToVisit(sampleRow, { visit_id: "B1-1001", status: "approved", reviewed_by: "manager", reviewed_at: "2026-10-21T04:00:00Z" });
    expect(v.review).toEqual({ status: "approved", by: "manager", at: "2026-10-21T04:00:00Z" });
  });

  it("converts UTC to store time across midnight", () => {
    expect(storeLocal("2026-10-17T20:00:00Z")).toEqual({ date: "2026-10-18", time: "01:30" });
  });
});
