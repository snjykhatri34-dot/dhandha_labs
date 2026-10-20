// In-memory implementation of the data layer, seeded from the synthetic files in the repo.
// State lives on globalThis so it survives dev-mode module reloads and is shared by every
// route in the same server process. It resets when the server restarts.

import type { DataLayer, Visit } from "@/lib/data/types";
import { buildDailyReport } from "@/lib/data/report";
import { NO_ANALYSIS } from "@/lib/data/normalise";
import { byNewest, matchesFilter, nextVisitId } from "@/lib/data/visit-list";
import { LABELLED_VISITS, PIPELINE_RUN_VISITS, SAMPLE_DAY_DATE, SAMPLE_DAY_VISITS } from "./sources";

// Bump when the Visit shape changes, so dev servers drop records created by older code.
const MOCK_STATE_VERSION = 2;

interface MockState {
  version: number;
  visits: Map<string, Visit>;
  cannedIndex: number;
}

const g = globalThis as typeof globalThis & { __uxMockState?: MockState };

function state(): MockState {
  if (g.__uxMockState?.version !== MOCK_STATE_VERSION) {
    g.__uxMockState = {
      version: MOCK_STATE_VERSION,
      visits: new Map([...SAMPLE_DAY_VISITS, ...LABELLED_VISITS].map((v) => [v.id, structuredClone(v)])),
      cannedIndex: 0,
    };
  }
  return g.__uxMockState;
}

/** For tests: start again from the seed data. */
export function resetMockState() {
  delete g.__uxMockState;
}

const ANALYSE_DELAY_MS = Number(process.env.MOCK_ANALYSE_DELAY_MS ?? 3000);

export const mockDataLayer: DataLayer = {
  visits: {
    async list(filter = {}) {
      return [...state().visits.values()].filter((v) => matchesFilter(v, filter)).sort(byNewest).map((v) => structuredClone(v));
    },
    async get(id) {
      const v = state().visits.get(id);
      return v ? structuredClone(v) : null;
    },
    async create(input) {
      // Keep the store's wall-clock time from the ISO string ("2026-10-20T18:05:00+05:30" → "18:05"),
      // not the server's time zone.
      const localTime = input.recordedAt.match(/T(\d{2}:\d{2})/)?.[1] ?? null;
      const visit: Visit = {
        id: nextVisitId(input.store, state().visits.keys()),
        store: input.store,
        salesperson: input.salesperson,
        date: input.recordedAt.slice(0, 10),
        startTime: localTime,
        durationMin: null,
        status: "uploaded",
        mediaPath: input.mediaPath,
        ...NO_ANALYSIS,
        error: null,
        review: { status: "pending", by: null, at: null },
      };
      state().visits.set(visit.id, visit);
      return structuredClone(visit);
    },
    async setReview(id, status, by) {
      const v = state().visits.get(id);
      if (!v) throw new Error(`Visit ${id} not found`);
      v.review = { status, by, at: new Date().toISOString() };
    },
  },

  reports: {
    async getByDate(date) {
      // The report is a closing-time snapshot of the sample day, like Stream 2's will be.
      // Visits uploaded later show in the visit list but don't change the report.
      if (date !== SAMPLE_DAY_DATE) return null;
      return buildDailyReport(date, SAMPLE_DAY_VISITS, `${SAMPLE_DAY_DATE}T21:00:00+05:30`);
    },
    async latest() {
      return this.getByDate(SAMPLE_DAY_DATE);
    },
    async dates() {
      return [SAMPLE_DAY_DATE];
    },
  },

  analyser: {
    async analyse(visitId) {
      const v = state().visits.get(visitId);
      if (!v) throw new Error(`Visit ${visitId} not found`);
      // Mock Stream 1: after a delay, attach a canned scorecard from Stream 2's latest SOP run.
      const canned = PIPELINE_RUN_VISITS[state().cannedIndex++ % PIPELINE_RUN_VISITS.length];
      setTimeout(() => {
        const target = state().visits.get(visitId);
        if (!target) return;
        if (target.salesperson.toLowerCase().includes("fail")) {
          // Lets the upload page demo its failure state: use a salesperson name containing "fail".
          Object.assign(target, { status: "failed", error: "Mock analysis failed (salesperson name contains 'fail')." });
          return;
        }
        Object.assign(target, {
          status: "analysed",
          outcome: canned.outcome,
          askedFor: canned.askedFor,
          shown: canned.shown,
          reasonNotBought: canned.reasonNotBought,
          objections: canned.objections,
          emotions: canned.emotions,
          emotionArc: canned.emotionArc,
          handlingScore: canned.handlingScore,
          handlingEvidence: canned.handlingEvidence,
          coachingTip: canned.coachingTip,
          lostDemand: canned.lostDemand,
          competitorMentioned: canned.competitorMentioned,
          customer: canned.customer,
          keyMoments: canned.keyMoments,
          missedOpportunities: canned.missedOpportunities,
          nextStep: canned.nextStep,
          priceTalk: canned.priceTalk,
          notAvailable: canned.notAvailable,
          competitor: canned.competitor,
          flags: [`mock: canned scorecard copied from ${canned.id}`, ...canned.flags],
          error: null,
        } satisfies Partial<Visit>);
      }, ANALYSE_DELAY_MS);
    },
  },
};
