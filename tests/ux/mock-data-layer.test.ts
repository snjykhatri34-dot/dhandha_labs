import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDataLayer, resetMockState } from "@/lib/data/mock";

const { visits, reports, analyser } = mockDataLayer;

describe("mock data layer", () => {
  beforeEach(() => {
    resetMockState();
    vi.useRealTimers();
  });

  it("seeds 102 sample-day visits plus 6 hand-labelled ones", async () => {
    expect(await visits.list({ date: "2026-10-17", review: "approved" })).toHaveLength(102);
    expect(await visits.list()).toHaveLength(108);
    expect((await visits.get("B2-1014"))?.coachingTip).toMatch(/show that weight first/);
  });

  it("filters by store, salesperson and outcome", async () => {
    const list = await visits.list({ store: "B2", salesperson: "Akshay", outcome: "walked_out" });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((v) => v.store === "B2" && v.salesperson === "Akshay" && v.outcome === "walked_out")).toBe(true);
  });

  it("upload → analyse → analysed, pending review", async () => {
    vi.useFakeTimers();
    const v = await visits.create({ store: "B2", salesperson: "Priya", recordedAt: "2026-10-20T18:05:00", mediaPath: "B2/2026-10-20/x.mp4" });
    expect(v).toMatchObject({ id: "B2-1103", status: "uploaded", review: { status: "pending" } });
    const ist = await visits.create({ store: "B1", salesperson: "Neha", recordedAt: "2026-10-20T18:05:00+05:30", mediaPath: "x" });
    expect(ist).toMatchObject({ date: "2026-10-20", startTime: "18:05" });
    await analyser.analyse(v.id);
    expect((await visits.get(v.id))?.status).toBe("uploaded");
    vi.runAllTimers();
    const done = await visits.get(v.id);
    expect(done?.status).toBe("analysed");
    expect(done?.outcome).not.toBeNull();
    expect(done?.flags[0]).toMatch(/^mock: canned scorecard/);
    expect(done?.keyMoments.length).toBeGreaterThan(0); // from Stream 2's pipeline run
  });

  it("fails analysis when the salesperson name contains 'fail'", async () => {
    vi.useFakeTimers();
    const v = await visits.create({ store: "B1", salesperson: "Fail Test", recordedAt: "2026-10-20T10:00:00", mediaPath: "x" });
    await analyser.analyse(v.id);
    vi.runAllTimers();
    expect(await visits.get(v.id)).toMatchObject({ status: "failed", error: expect.any(String) });
  });

  it("records reviews", async () => {
    await visits.setReview("B2-1014", "approved", "manager");
    expect((await visits.get("B2-1014"))?.review).toMatchObject({ status: "approved", by: "manager" });
  });

  it("returns the sample-day report and nothing for other dates", async () => {
    expect((await reports.latest())?.numbers.visits).toBe(102);
    expect(await reports.getByDate("2026-10-18")).toBeNull();
  });
});
