import { describe, expect, it } from "vitest";
import { filterOptions, parseVisitFilters } from "@/components/ux/visit/filters";
import { LABELLED_VISITS, SAMPLE_DAY_VISITS } from "@/lib/data/mock/sources";

describe("visit filters", () => {
  it("keeps allowed values and drops junk", () => {
    expect(parseVisitFilters({ store: "B2", outcome: "walked_out", salesperson: "Akshay", date: "2026-10-17" })).toEqual({
      filter: { store: "B2", outcome: "walked_out", salesperson: "Akshay", date: "2026-10-17" },
      showAll: false,
    });
    expect(parseVisitFilters({ store: "B9", outcome: "stolen", date: "yesterday", all: "1" })).toEqual({
      filter: { store: undefined, outcome: undefined, salesperson: undefined, date: undefined },
      showAll: true,
    });
  });

  it("offers salespeople for the chosen store, newest date first", () => {
    const all = [...SAMPLE_DAY_VISITS, ...LABELLED_VISITS];
    const opts = filterOptions(all, "B2");
    expect(opts.salespeople).toContain("Akshay");
    expect(opts.salespeople.every((name) => all.some((v) => v.store === "B2" && v.salesperson === name))).toBe(true);
    expect(opts.dates[0]).toBe("2026-10-17");
  });
});
