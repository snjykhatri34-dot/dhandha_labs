import { beforeEach, describe, expect, it } from "vitest";
import { canReview, canSeeScorecard, recentlyReviewed, reviewQueue } from "@/components/ux/review/visibility";
import { mockDataLayer, resetMockState } from "@/lib/data/mock";

const { visits } = mockDataLayer;

describe("manager review and visibility", () => {
  beforeEach(() => resetMockState());

  it("an unapproved scorecard is hidden from staff and visible to the owner and manager", async () => {
    const pending = (await visits.get("B2-1014"))!;
    expect(pending.review.status).toBe("pending");
    expect(canSeeScorecard("staff", pending)).toBe(false);
    expect(canSeeScorecard("owner", pending)).toBe(true);
    expect(canSeeScorecard("manager", pending)).toBe(true);
    // Staff pages list only approved visits from the repo.
    expect((await visits.list({ review: "approved", salesperson: "Akshay" })).map((v) => v.id)).not.toContain("B2-1014");
  });

  it("approving makes it visible to staff and takes it off the queue", async () => {
    expect(reviewQueue(await visits.list()).map((v) => v.id)).toContain("B2-1014");
    await visits.setReview("B2-1014", "approved", "manager");
    const approved = (await visits.get("B2-1014"))!;
    expect(canSeeScorecard("staff", approved)).toBe(true);
    const all = await visits.list();
    expect(reviewQueue(all).map((v) => v.id)).not.toContain("B2-1014");
    expect(recentlyReviewed(all)[0]).toMatchObject({ id: "B2-1014", review: { status: "approved", by: "manager" } });
  });

  it("rejected stays hidden from staff", async () => {
    await visits.setReview("B2-1016", "rejected", "manager");
    expect(canSeeScorecard("staff", (await visits.get("B2-1016"))!)).toBe(false);
  });

  it("queue holds only analysed, pending scorecards, oldest first", async () => {
    await visits.create({ store: "B1", salesperson: "Neha", recordedAt: "2026-10-20T11:00:00+05:30", mediaPath: "x" });
    const queue = reviewQueue(await visits.list());
    expect(queue.every((v) => v.status === "analysed" && v.review.status === "pending")).toBe(true);
    expect(queue.map((v) => v.id)).toEqual(["B2-1014", "B2-1015", "B2-1016", "B2-1017", "B2-1018", "B2-1019"]);
  });

  it("only owner and manager can review", () => {
    expect([canReview("owner"), canReview("manager"), canReview("staff")]).toEqual([true, true, false]);
  });
});
