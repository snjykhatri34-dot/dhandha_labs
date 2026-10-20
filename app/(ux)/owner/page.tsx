import { Suspense } from "react";
import { ReportForDate } from "@/components/ux/report/ReportForDate";
import { LoadingBlock } from "@/components/ux/shared";
import { OwnerVisits } from "@/components/ux/visit/OwnerVisits";

export default function OwnerPage(props: PageProps<"/owner">) {
  return (
    <>
      <Suspense fallback={<LoadingBlock label="Loading today's report…" />}>
        <ReportForDate date="latest" />
      </Suspense>
      <section id="visits" className="mt-8 scroll-mt-20">
        <h2 className="mb-3 text-lg font-semibold">Visits</h2>
        <Suspense fallback={<LoadingBlock label="Loading visits…" />}>
          <OwnerVisits searchParams={props.searchParams} />
        </Suspense>
      </section>
    </>
  );
}
