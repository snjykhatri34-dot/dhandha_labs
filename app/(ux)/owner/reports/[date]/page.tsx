// Target of the WhatsApp link: /owner/reports/2026-10-17
import { Suspense } from "react";
import { ReportForDate } from "@/components/ux/report/ReportForDate";
import { LoadingBlock } from "@/components/ux/shared";

export default function ReportByDatePage(props: PageProps<"/owner/reports/[date]">) {
  return (
    <Suspense fallback={<LoadingBlock label="Loading report…" />}>
      <ReportForDate date={props.params.then((p) => p.date)} />
    </Suspense>
  );
}
