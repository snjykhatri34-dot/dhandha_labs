// Real implementation against Stream 2's Supabase tables. Stubs until Stream 2 ships.
// When implementing: map `visits` rows (lib/types/scorecard.ts VisitRow) to `Visit` in a
// mapping function in this folder. Never change components to fit the table.

import { NotImplementedError, type DataLayer } from "@/lib/data/types";

const notYet = (what: string) => async (): Promise<never> => {
  throw new NotImplementedError(what);
};

export const supabaseDataLayer: DataLayer = {
  visits: {
    list: notYet("VisitRepo.list"),
    get: notYet("VisitRepo.get"),
    create: notYet("VisitRepo.create"),
    setReview: notYet("VisitRepo.setReview"),
  },
  reports: {
    getByDate: notYet("ReportRepo.getByDate"),
    latest: notYet("ReportRepo.latest"),
    dates: notYet("ReportRepo.dates"),
  },
  analyser: {
    analyse: notYet("AnalyseClient.analyse"),
  },
};
