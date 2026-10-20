import Link from "next/link";
import { Suspense } from "react";
import { PAY_NOTICE } from "@/components/ux/review/visibility";
import { LoadingBlock } from "@/components/ux/shared";
import { GatedScorecard } from "@/components/ux/visit/GatedScorecard";

export default function StaffVisitPage(props: PageProps<"/staff/visits/[id]">) {
  return (
    <>
      <Link href="/staff" className="mb-4 inline-block text-sm text-muted hover:text-ink">
        ← My scorecards
      </Link>
      <Suspense fallback={<LoadingBlock label="Loading scorecard…" />}>
        <GatedScorecard id={props.params.then((p) => p.id)} />
      </Suspense>
      <p className="mt-6 text-xs text-muted">{PAY_NOTICE}</p>
    </>
  );
}
