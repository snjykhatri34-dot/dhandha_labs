import Link from "next/link";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ux/shared";
import { GatedScorecard } from "@/components/ux/visit/GatedScorecard";

export default function VisitPage(props: PageProps<"/owner/visits/[id]">) {
  return (
    <>
      <Link href="/owner#visits" className="mb-4 inline-block text-sm text-muted hover:text-ink">
        ← All visits
      </Link>
      <Suspense fallback={<LoadingBlock label="Loading scorecard…" />}>
        <GatedScorecard id={props.params.then((p) => p.id)} />
      </Suspense>
    </>
  );
}
