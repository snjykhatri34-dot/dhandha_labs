// Loads the synthetic data already in the repo and normalises it into `Visit`.
// Sources: data/sample_day (102 slim visits), expected_outputs/visits (6 hand labels) and
// evaluator/runs/2026-10-20-v4 (Stream 2's latest SOP output for the same 6 conversations).

import sampleDay from "@/data/sample_day/visits_2026-10-17.json";
import akshay1014 from "@/expected_outputs/visits/B2_Akshay_2026-10-15_1014.json";
import priya1015 from "@/expected_outputs/visits/B2_Priya_2026-10-15_1015.json";
import akshay1016 from "@/expected_outputs/visits/B2_Akshay_2026-10-16_1016.json";
import priya1017 from "@/expected_outputs/visits/B2_Priya_2026-10-16_1017.json";
import akshay1018 from "@/expected_outputs/visits/B2_Akshay_2026-10-17_1018.json";
import rohit1019 from "@/expected_outputs/visits/B2_Rohit_2026-10-17_1019.json";
import run1014 from "@/evaluator/runs/2026-10-20-v4/B2-1014.json";
import run1015 from "@/evaluator/runs/2026-10-20-v4/B2-1015.json";
import run1016 from "@/evaluator/runs/2026-10-20-v4/B2-1016.json";
import run1017 from "@/evaluator/runs/2026-10-20-v4/B2-1017.json";
import run1018 from "@/evaluator/runs/2026-10-20-v4/B2-1018.json";
import run1019 from "@/evaluator/runs/2026-10-20-v4/B2-1019.json";
import { analysisFields, NO_NUANCE, parseCue, type ScorecardJson } from "@/lib/data/normalise";
import type { Visit } from "@/lib/data/types";
import type { Store } from "@/lib/types/scorecard";

export const SAMPLE_DAY_DATE = "2026-10-17";

export { NO_NUANCE, parseCue };

type SourceJson = ScorecardJson & { visit_id: string; salesperson: string; date: string };

export function fromSampleDay(v: SourceJson): Visit {
  return {
    id: v.visit_id,
    store: v.store as Store,
    salesperson: v.salesperson,
    date: v.date,
    startTime: v.start ?? null,
    durationMin: v.duration_min ?? null,
    status: "analysed",
    mediaPath: null,
    ...analysisFields(v),
    error: null,
    // The sample day is a past, already-reviewed day.
    review: { status: "approved", by: "sample data", at: null },
  };
}

export function fromLabelled(v: SourceJson): Visit {
  return {
    id: v.visit_id,
    store: (v.store ?? v.branch) as Store,
    salesperson: v.salesperson,
    date: v.date,
    startTime: null,
    durationMin: null,
    status: "analysed",
    mediaPath: null,
    ...analysisFields(v),
    error: null,
    // Hand-labelled scorecards start in the manager's review queue.
    review: { status: "pending", by: null, at: null },
  };
}

export const LABELLED_VISITS: Visit[] = [akshay1014, priya1015, akshay1016, priya1017, akshay1018, rohit1019].map(
  (v) => fromLabelled(v as SourceJson),
);

/** Stream 2's SOP output for the six conversations: what a real analysed visit looks like. */
export const PIPELINE_RUN_VISITS: Visit[] = [run1014, run1015, run1016, run1017, run1018, run1019].map((v) =>
  fromLabelled(v as SourceJson),
);

export const SAMPLE_DAY_VISITS: Visit[] = (sampleDay as SourceJson[]).map(fromSampleDay);
