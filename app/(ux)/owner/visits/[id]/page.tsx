import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ux/shared";
import { RefreshWhileAnalysing } from "@/components/ux/visit/RefreshWhileAnalysing";
import { VisitScorecard } from "@/components/ux/visit/VisitScorecard";
import { toVisitView } from "@/components/ux/visit/view";
import { visits } from "@/lib/data";

async function VisitDetail({ id }: { id: Promise<string> }) {
  await connection();
  const visit = await visits.get(decodeURIComponent(await id));
  if (!visit) notFound();
  return (
    <>
      <VisitScorecard visit={visit} view={toVisitView(visit)} />
      {visit.status === "uploaded" && (
        <div className="mt-4">
          <RefreshWhileAnalysing />
        </div>
      )}
    </>
  );
}

export default function VisitPage(props: PageProps<"/owner/visits/[id]">) {
  return (
    <>
      <Link href="/owner#visits" className="mb-4 inline-block text-sm text-muted hover:text-ink">
        ← All visits
      </Link>
      <Suspense fallback={<LoadingBlock label="Loading scorecard…" />}>
        <VisitDetail id={props.params.then((p) => p.id)} />
      </Suspense>
    </>
  );
}
