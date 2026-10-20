import { describe, expect, it } from "vitest";
import { toVisitView } from "@/components/ux/visit/view";
import { LABELLED_VISITS, PIPELINE_RUN_VISITS, SAMPLE_DAY_VISITS } from "@/lib/data/mock/sources";

const byId = (list: typeof LABELLED_VISITS, id: string) => list.find((v) => v.id === id)!;

describe("visit scorecard view", () => {
  it("hand-labelled B2-1014: summary, coaching and the evidence behind feelings", () => {
    const view = toVisitView(byId(LABELLED_VISITS, "B2-1014"));
    expect(view.heading).toBe("Akshay · Store B2");
    expect(view.summary).toMatchObject({ title: "Walked out", tone: "bad" });
    expect(view.summary.line).toBe("Wanted necklace (20–35 g), for daily office wear. Didn't buy: weight mismatch.");
    expect(view.lostDemand).toBe(true);
    expect(view.handling).toMatchObject({ score: 2, word: "Weak" });
    expect(view.handling?.tip).toMatch(/show that weight first/);
    expect(view.timeline.find((t) => t.tag === "Feeling" && t.at === "00:24")).toMatchObject({
      time: "0:24",
      text: "Customer felt disappointed",
      detail: "From what they said: 'That's far too heavy'",
    });
    expect(view.timeline.find((t) => t.tag === "Concern")?.text).toBe("Weight wasn't right");
  });

  it("pipeline B2-1014: everything lands on one time-ordered timeline in plain words", () => {
    const view = toVisitView(byId(PIPELINE_RUN_VISITS, "B2-1014"));
    const ats = view.timeline.map((t) => t.at);
    expect(ats).toEqual([...ats].sort());
    expect(view.timeline.filter((t) => t.tag === "Hurt the sale").every((t) => t.text.startsWith("Salesperson "))).toBe(true);
    expect(view.timeline.find((t) => t.tag === "Didn't have it")).toMatchObject({
      time: "1:02",
      text: "Asked for necklace 20-35 g",
      detail: "“Not in that range right now, ma'am.” · Nothing else was offered",
    });
    expect(view.timeline.find((t) => t.tag === "Competitor")?.text).toBe("Mentioned another showroom");
    expect(view.customer).toContainEqual({ label: "Came", value: "On their own" });
    expect(view.customer).toContainEqual(expect.objectContaining({ label: "Interest", value: "Very keen to buy" }));
    expect(view.customer).toContainEqual({ label: "Mood", value: "Interested → Disappointed" });
    expect(view.price).toContainEqual({ label: "Explained the price breakup", value: "No" });
  });

  it("pipeline B2-1017: next step for a customer who'll decide later", () => {
    const view = toVisitView(byId(PIPELINE_RUN_VISITS, "B2-1017"));
    expect(view.summary.title).toBe("Needs follow-up");
    expect(view.nextStep).toContainEqual({ label: "When", value: "Sunday" });
  });

  it("turns the analysis's working notes into plain words and drops developer notes", () => {
    const view = toVisitView({
      ...byId(PIPELINE_RUN_VISITS, "B2-1019"),
      flags: ["mock: canned scorecard copied from B2-1019", "purity_trust raised as a HUID question at 00:36 and answered"],
    });
    expect(view.notes).toEqual(["Purity doubts raised as a hallmark number (HUID) question at 00:36 and answered"]);
  });

  it("sample-day visit is summary-only", () => {
    const view = toVisitView(SAMPLE_DAY_VISITS[0]);
    expect(view.summaryOnly).toBe(true);
    expect(view.timeline).toEqual([]);
    expect(view.when).toBe("Sat 17 Oct 2026 · 19:10");
    expect(view.details).toContainEqual({ label: "Sale value", value: "₹1.02 lakh" });
  });
});
