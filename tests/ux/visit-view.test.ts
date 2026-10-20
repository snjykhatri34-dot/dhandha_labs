import { describe, expect, it } from "vitest";
import { toVisitView } from "@/components/ux/visit/view";
import { LABELLED_VISITS, PIPELINE_RUN_VISITS, SAMPLE_DAY_VISITS } from "@/lib/data/mock/sources";

const byId = (list: typeof LABELLED_VISITS, id: string) => list.find((v) => v.id === id)!;

describe("visit scorecard view", () => {
  it("hand-labelled B2-1014: outcome, why, cues and coaching", () => {
    const view = toVisitView(byId(LABELLED_VISITS, "B2-1014"));
    expect(view.heading).toBe("Akshay · B2");
    expect(view.reason).toBe("Weight mismatch");
    expect(view.lostDemand).toBe(true);
    expect(view.askedFor).toBe("necklace · 20-35 g · for daily office wear");
    expect(view.handling).toMatchObject({ score: 2 });
    expect(view.handling?.tip).toMatch(/show that weight first/);
    const emotion = view.timeline.find((t) => t.kind === "emotion" && t.at === "00:24");
    expect(emotion).toMatchObject({ title: "Customer felt disappointed", cue: "words: 'That's far too heavy'" });
    expect(view.summaryOnly).toBe(false);
  });

  it("pipeline B2-1014: nuance fields land on one time-ordered timeline", () => {
    const view = toVisitView(byId(PIPELINE_RUN_VISITS, "B2-1014"));
    const ats = view.timeline.map((t) => t.at);
    expect(ats).toEqual([...ats].sort());
    expect(view.timeline.filter((t) => t.kind === "moment").every((t) => t.tone === "bad")).toBe(true);
    expect(view.timeline.find((t) => t.kind === "stockGap")).toMatchObject({
      at: "01:02",
      title: "necklace 20-35 g",
      tone: "bad",
    });
    expect(view.timeline.find((t) => t.kind === "competitor")?.at).toBe("00:44");
    expect(view.customer?.line).toBe("solo · high intent · decides: the customer");
    expect(view.facts).toContainEqual({ label: "Price breakup given", value: "No" });
    expect(view.emotionArc).toBe("interested → disappointed");
  });

  it("pipeline B2-1017: next step for a deferred visit", () => {
    const view = toVisitView(byId(PIPELINE_RUN_VISITS, "B2-1017"));
    expect(view.facts.find((f) => f.label === "Next step")?.value).toMatch(/Sunday · Priya$/);
  });

  it("sample-day visit is summary-only", () => {
    const view = toVisitView(SAMPLE_DAY_VISITS[0]);
    expect(view.summaryOnly).toBe(true);
    expect(view.timeline).toEqual([]);
    expect(view.when).toBe("Sat 17 Oct 2026 · 19:10");
    expect(view.value).toBe("₹1.02 lakh");
  });
});
