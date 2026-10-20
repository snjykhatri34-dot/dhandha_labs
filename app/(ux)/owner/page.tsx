import { Suspense } from "react";
import { ReportForDate } from "@/components/ux/report/ReportForDate";
import { LoadingBlock } from "@/components/ux/shared";

export default function OwnerPage() {
  return (
    <>
      <Suspense fallback={<LoadingBlock label="Loading today's report…" />}>
        <ReportForDate date="latest" />
      </Suspense>
      {/* Visit list with filters lands here in ux/owner-visits. */}
    </>
  );
}
