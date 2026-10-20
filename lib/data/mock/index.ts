// In-memory implementation of the data layer, seeded from the synthetic files in the repo.
// State lives on globalThis so it survives dev-mode module reloads and is shared by every
// route in the same server process. It resets when the server restarts.

import type { DataLayer, Visit, VisitFilter } from "@/lib/data/types";
import { buildDailyReport } from "./report";
import { LABELLED_VISITS, SAMPLE_DAY_DATE, SAMPLE_DAY_VISITS } from "./sources";

interface MockState {
  visits: Map<string, Visit>;
  cannedIndex: number;
}

const g = globalThis as typeof globalThis & { __uxMockState?: MockState };

function state(): MockState {
  if (!g.__uxMockState) {
    g.__uxMockState = {
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

function matches(v: Visit, f: VisitFilter) {
  return (
    (!f.date || v.date === f.date) &&
    (!f.store || v.store === f.store) &&
    (!f.salesperson || v.salesperson === f.salesperson) &&
    (!f.outcome || v.outcome === f.outcome) &&
    (!f.status || v.status === f.status) &&
    (!f.review || v.review.status === f.review)
  );
}

/** Newest first: date, then start time, then id. */
function byNewest(a: Visit, b: Visit) {
  return (
    b.date.localeCompare(a.date) ||
    (b.startTime ?? "").localeCompare(a.startTime ?? "") ||
    b.id.localeCompare(a.id)
  );
}

function nextId(store: string) {
  const numbers = [...state().visits.keys()].map((id) => Number(id.split("-")[1])).filter(Number.isFinite);
  return `${store}-${Math.max(1000, ...numbers) + 1}`;
}

export const mockDataLayer: DataLayer = {
  visits: {
    async list(filter = {}) {
      return [...state().visits.values()].filter((v) => matches(v, filter)).sort(byNewest).map((v) => structuredClone(v));
    },
    async get(id) {
      const v = state().visits.get(id);
      return v ? structuredClone(v) : null;
    },
    async create(input) {
      const recorded = new Date(input.recordedAt);
      const visit: Visit = {
        id: nextId(input.store),
        store: input.store,
        salesperson: input.salesperson,
        date: input.recordedAt.slice(0, 10),
        startTime: Number.isNaN(recorded.getTime())
          ? null
          : `${String(recorded.getHours()).padStart(2, "0")}:${String(recorded.getMinutes()).padStart(2, "0")}`,
        durationMin: null,
        status: "uploaded",
        mediaPath: input.mediaPath,
        outcome: null,
        askedFor: null,
        shown: [],
        reasonNotBought: null,
        objections: [],
        emotions: [],
        emotionArc: null,
        handlingScore: null,
        handlingEvidence: null,
        coachingTip: null,
        lostDemand: null,
        competitorMentioned: null,
        valueInr: null,
        flags: [],
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
      // Mock Stream 1: after a delay, attach a canned scorecard from one of the six scripted conversations.
      const canned = LABELLED_VISITS[state().cannedIndex++ % LABELLED_VISITS.length];
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
          flags: [`mock: canned scorecard copied from ${canned.id}`],
          error: null,
        } satisfies Partial<Visit>);
      }, ANALYSE_DELAY_MS);
    },
  },
};
